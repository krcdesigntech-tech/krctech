/**
 * RAG augmentor: scan retrieved document chunks for law references that
 * have a `legal_references` mapping, then fetch the current law article
 * via the resolver and return them as additional context blocks.
 *
 * Strategy:
 *   1. Extract candidate law names from chunk text using the same
 *      "「...」" / "제○조" patterns we use during PDF seeding.
 *   2. Match against `legal_references` (canonical_law_name first,
 *      then law_name) using normalized comparison.
 *   3. For each match, call `resolveReferenceLatest()` (cache-first).
 *   4. Format as a labelled block the prompt builder can paste in.
 */

import { createServiceClient } from '@/lib/supabase/server'
import { lawNamesEquivalent, normalizeLawName } from './name-canonicalizer'
import { resolveReferenceLatest, PDF_REFERENCE_DATE } from './resolver'
import type { LegalReference } from '@/types/law.types'
import type { MatchedChunk } from '@/types/database.types'

const LAW_BRACKET = /「([^」]{2,80})」/g

export interface LegalContextBlock {
  reference_id: string
  law_name: string
  article_ref: string | null
  enforcement_date: string | null
  amended_after_pdf: boolean
  body: string
  detail_link?: string
}

export async function buildLegalContext(chunks: MatchedChunk[]): Promise<LegalContextBlock[]> {
  if (!chunks.length) return []

  // 1. Collect candidate law names from chunk content.
  const candidates = new Set<string>()
  for (const c of chunks) {
    LAW_BRACKET.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = LAW_BRACKET.exec(c.content)) !== null) {
      const name = m[1].trim().replace(/\s+/g, ' ')
      if (/[법령규칙]/.test(name)) candidates.add(normalizeLawName(name))
    }
  }
  if (candidates.size === 0) return []

  // 2. Pull all references and filter in memory (the table is small — ≤ low hundreds of rows).
  const supabase = await createServiceClient()
  const { data: refs } = await supabase
    .from('legal_references')
    .select('*')
    .neq('api_target', 'external')

  if (!refs?.length) return []

  const candidateList = Array.from(candidates)
  const matches = new Map<string, LegalReference>()
  for (const r of refs as LegalReference[]) {
    const candidateA = r.canonical_law_name ? normalizeLawName(r.canonical_law_name) : ''
    const candidateB = normalizeLawName(r.law_name)
    for (const name of candidateList) {
      if (
        (candidateA && lawNamesEquivalent(candidateA, name)) ||
        lawNamesEquivalent(candidateB, name)
      ) {
        // Prefer verified mappings; tie-break by higher confidence.
        const key = `${r.canonical_law_name ?? r.law_name}::${r.article_ref ?? ''}`
        const incumbent = matches.get(key)
        if (
          !incumbent ||
          (r.verified_at && !incumbent.verified_at) ||
          r.confidence > incumbent.confidence
        ) {
          matches.set(key, r)
        }
      }
    }
  }
  if (matches.size === 0) return []

  // 3. Resolve each match. Cap at 5 to keep prompt size manageable.
  const top = Array.from(matches.values()).slice(0, 5)
  const blocks: LegalContextBlock[] = []
  for (const ref of top) {
    try {
      const result = await resolveReferenceLatest(ref)
      if (!result.payload) continue
      const payload = result.payload
      let body = ''
      let enforcementDate: string | null = null
      let detailLink: string | undefined

      if ('articles' in payload) {
        body = payload.articles.map((a) => `${a.article_ref} ${a.title ?? ''}\n${a.content}`).join('\n\n')
        enforcementDate = payload.law.enforcement_date
        detailLink = payload.law.detail_link
      } else {
        body = payload.body
        enforcementDate = payload.enforcement_date
        detailLink = payload.detail_link
      }
      if (!body.trim()) continue

      blocks.push({
        reference_id: ref.id,
        law_name: ref.canonical_law_name ?? ref.law_name,
        article_ref: ref.article_ref,
        enforcement_date: enforcementDate,
        amended_after_pdf: result.amended_after_pdf,
        body,
        detail_link: detailLink,
      })
    } catch {
      // ignore single-reference failures; remaining blocks are still useful.
    }
  }
  return blocks
}

export function formatLegalBlocksForPrompt(blocks: LegalContextBlock[]): string {
  if (!blocks.length) return ''
  const parts = blocks.map((b, i) => {
    const header = `[법령 ${i + 1}: ${b.law_name}${b.article_ref ? ` ${b.article_ref}` : ''}` +
      (b.enforcement_date ? ` · 시행 ${b.enforcement_date}` : '') +
      (b.amended_after_pdf ? ` · ⚠ PDF 작성(${PDF_REFERENCE_DATE}) 이후 개정` : '') +
      `]`
    return `${header}\n${b.body}`
  })
  return `다음은 위 문서와 연결된 현행 법령 조문(법제처 OPEN API 실시간 조회)입니다:\n\n${parts.join(
    '\n\n---\n\n'
  )}`
}
