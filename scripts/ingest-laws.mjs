/**
 * 법령 인제스천 배치 스크립트 (로컬 실행, tsx).
 *
 *   pnpm ingest:laws -- --pdf "2026.02.02 ...完.pdf" --hwpx "2026.02.23 ...完.hwpx"
 *   node --import tsx scripts/ingest-laws.mjs --hwpx "...hwpx" --dry-run
 *
 * 흐름: PDF/HWPX 추출 → 후보 병합 → 법제처 전문 보강 → 청크 → Gemini 768 임베딩
 *       → laws / law_chunks / law_chunk_sources / law_references / law_match_failures
 *
 * 필요한 env (.env.local 자동 로드): GEMINI_API_KEY, LAW_OPEN_API_OC,
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * 플래그: --pdf <path> --hwpx <path> --limit <n> --dry-run --force --only-failures
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'
import {
  extractPdfSource,
  extractHwpxSource,
  mergeCandidates,
} from '../src/lib/law/source-extractors.ts'
import { embedDocuments } from '../src/lib/llm/hf-embeddings.ts'
import { articleRefToJo } from '../src/lib/law/article-code.ts'

// ── env 로드 ────────────────────────────────────────────────────────────────
function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    const p = resolve(process.cwd(), f)
    if (!existsSync(p)) continue
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (!m) continue
      const key = m[1]
      let val = m[2].replace(/^["']|["']$/g, '')
      if (process.env[key] === undefined) process.env[key] = val
    }
  }
}
loadEnv()

// ── 인자 파싱 ───────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { dryRun: false, force: false, onlyFailures: false, limit: Infinity }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pdf') args.pdf = argv[++i]
    else if (a === '--hwpx') args.hwpx = argv[++i]
    else if (a === '--limit') args.limit = parseInt(argv[++i], 10)
    else if (a === '--dry-run') args.dryRun = true
    else if (a === '--force') args.force = true
    else if (a === '--only-failures') args.onlyFailures = true
  }
  return args
}
const ARGS = parseArgs(process.argv.slice(2))

function sb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요')
  return createClient(url, key, { auth: { persistSession: false } })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const sha256 = async (text) => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// ── 법제처 Open API (최소 구현) ──────────────────────────────────────────────
const LAW_BASE = 'https://www.law.go.kr/DRF'
function lawOC() {
  const oc = process.env.LAW_OPEN_API_OC
  if (!oc) throw new Error('LAW_OPEN_API_OC 필요')
  return oc
}
async function lawFetch(endpoint, params) {
  const url = new URL(`${LAW_BASE}/${endpoint}`)
  url.searchParams.set('OC', lawOC())
  url.searchParams.set('type', 'JSON')
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v))
  }
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`law.go.kr ${endpoint} HTTP ${res.status}`)
  const t = await res.text()
  try {
    return JSON.parse(t)
  } catch {
    throw new Error(`law.go.kr ${endpoint} non-JSON: ${t.slice(0, 120)}`)
  }
}
async function searchLaw(query) {
  const data = await lawFetch('lawSearch.do', { target: 'law', query, display: 10, page: 1 })
  const hits = data?.LawSearch?.law
  if (!hits) return []
  const arr = Array.isArray(hits) ? hits : [hits]
  return arr.map((h) => ({
    law_id: h.법령ID ?? '',
    mst: h.법령일련번호 ?? '',
    name: h.법령명한글 ?? '',
    short_name: h.법령약칭명 ?? null,
    ministry: h.소관부처명 ?? null,
  }))
}
async function getWholeLaw(lawId, mst) {
  const data = await lawFetch('lawService.do', { target: 'law', ID: lawId, MST: mst })
  const base = data?.법령?.기본정보 ?? {}
  let node = data?.법령?.조문
  if (node && node.조문단위) node = node.조문단위
  const arr = Array.isArray(node) ? node : node ? [node] : []
  const articles = []
  for (const n of arr) {
    const no = (n.조문번호 ?? '').toString().trim()
    if (!no) continue
    const branch = (n.조문가지번호 ?? '').toString().trim()
    const ref = branch && branch !== '0' ? `제${no}조의${branch}` : `제${no}조`
    const title = (n.조문제목 ?? '').toString().trim() || null
    const head = Array.isArray(n.조문내용) ? n.조문내용.join('\n') : n.조문내용 ?? ''
    const paras = []
    if (n.항) {
      const items = Array.isArray(n.항) ? n.항 : [n.항]
      for (const it of items) {
        const b = Array.isArray(it.항내용) ? it.항내용.join('\n') : it.항내용
        if (b && String(b).trim()) paras.push(String(b).trim())
      }
    }
    const content = [String(head).trim(), ...paras].filter(Boolean).join('\n')
    if (content) articles.push({ article_ref: ref, article_no: no, title, content })
  }
  return {
    law_name: base.법령명_한글 ?? base.법령명한글 ?? '',
    ministry: typeof base.소관부처 === 'string' ? base.소관부처 : base.소관부처?.content ?? null,
    effective_date: parseDate(base.시행일자),
    articles,
  }
}
function parseDate(s) {
  if (!s) return null
  const d = String(s).replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}` : null
}

// 조문이 너무 길면 ~1500자 단위로 분할 (article_no 유지).
function splitArticle(content, maxChars = 1500) {
  if (content.length <= maxChars) return [content]
  const parts = []
  let buf = ''
  for (const line of content.split('\n')) {
    if (buf.length + line.length > maxChars && buf) {
      parts.push(buf)
      buf = ''
    }
    buf += (buf ? '\n' : '') + line
  }
  if (buf) parts.push(buf)
  return parts
}

async function main() {
  const t0 = Date.now()
  console.log('[ingest-laws] start', { pdf: ARGS.pdf, hwpx: ARGS.hwpx, dryRun: ARGS.dryRun })

  // 1) 원본 추출
  let pdfExtract = null
  let hwpxExtract = null
  if (ARGS.pdf) {
    pdfExtract = await extractPdfSource(readFileSync(resolve(ARGS.pdf)))
    console.log('[pdf] stats', pdfExtract.stats)
  }
  if (ARGS.hwpx) {
    hwpxExtract = await extractHwpxSource(readFileSync(resolve(ARGS.hwpx)))
    console.log('[hwpx] stats', hwpxExtract.stats)
  }
  if (!pdfExtract && !hwpxExtract) {
    throw new Error('--pdf 또는 --hwpx 중 하나는 필요합니다.')
  }

  const merged = mergeCandidates(
    pdfExtract?.candidates ?? [],
    hwpxExtract?.candidates ?? []
  )
  console.log(`[merge] ${merged.length} unique candidates`)

  if (ARGS.dryRun) {
    const failures = merged.filter((c) => c.api_target !== 'law').length
    console.log('[dry-run] sample:', merged.slice(0, 10).map((c) => `${c.canonical_law_name} ${c.article_ref ?? ''}`))
    console.log('[dry-run] law:', merged.filter((c) => c.api_target === 'law').length, 'non-law:', failures)
    return
  }

  const db = sb()

  // 2) 원본 문서 기록
  async function recordSource(extract, filename, sourceDate) {
    if (!extract) return null
    const { data } = await db
      .from('law_source_documents')
      .insert({
        source_type: extract.source_type,
        filename,
        source_date: sourceDate,
        page_count: extract.page_count,
        text_hash: await sha256(extract.text),
        extractor_version: 'v1',
      })
      .select('id')
      .single()
    return data?.id ?? null
  }
  const pdfDocId = await recordSource(pdfExtract, ARGS.pdf ?? '', '2026-02-02')
  const hwpxDocId = await recordSource(hwpxExtract, ARGS.hwpx ?? '', '2026-02-23')

  // 3) 고유 법령(법률) 단위로 그룹화 → 법제처 전문 fetch
  const lawGroups = new Map() // canonical → { api_target, candidates[] }
  for (const c of merged) {
    const key = c.canonical_law_name.replace(/\s+/g, '')
    if (!lawGroups.has(key)) lawGroups.set(key, { canonical: c.canonical_law_name, api_target: c.api_target, candidates: [] })
    lawGroups.get(key).candidates.push(c)
  }

  const stats = { candidate: merged.length, resolved: 0, failure: 0, embedded: 0 }
  let processed = 0

  for (const group of lawGroups.values()) {
    if (processed >= ARGS.limit) break
    processed++

    // 법률만 자동 전문 보강. 행정규칙/external 은 검수 큐로.
    if (group.api_target !== 'law') {
      await db.from('law_match_failures').insert({
        law_name: group.canonical,
        api_target: group.api_target,
        reason: group.api_target === 'admrul' ? '행정규칙 ID 미확인 (검색 API 미지원)' : 'external/법제처 외부 자료',
        source_anchor: group.candidates[0]?.source_anchor ?? null,
      })
      stats.failure++
      continue
    }

    let hits
    try {
      hits = await searchLaw(group.canonical)
    } catch (e) {
      console.warn('[search] error', group.canonical, e.message)
      hits = []
    }
    await sleep(200)

    if (!hits.length || !hits[0].law_id && !hits[0].mst) {
      await db.from('law_match_failures').insert({
        law_name: group.canonical,
        api_target: 'law',
        reason: '법제처 검색 결과 없음',
        candidate_hits: hits,
      })
      stats.failure++
      continue
    }

    const top = hits[0]
    let whole
    try {
      whole = await getWholeLaw(top.law_id, top.mst)
    } catch (e) {
      console.warn('[getLaw] error', group.canonical, e.message)
      await db.from('law_match_failures').insert({
        law_name: group.canonical, api_target: 'law', reason: `전문 조회 실패: ${e.message}`,
      })
      stats.failure++
      continue
    }
    await sleep(200)

    if (!whole.articles.length) {
      await db.from('law_match_failures').insert({
        law_name: group.canonical, api_target: 'law', reason: '조문 0건',
      })
      stats.failure++
      continue
    }

    const rawText = whole.articles.map((a) => `${a.article_ref} ${a.title ?? ''}\n${a.content}`).join('\n\n')
    const contentHash = await sha256(rawText)
    const lawKey = `law:${top.law_id || top.mst || group.canonical}`

    // laws upsert
    const { data: lawRow } = await db
      .from('laws')
      .upsert(
        {
          law_key: lawKey,
          law_name: whole.law_name || group.canonical,
          canonical_law_name: group.canonical,
          law_id: top.law_id || null,
          mst: top.mst || null,
          api_target: 'law',
          ministry: whole.ministry,
          effective_date: whole.effective_date,
          source: 'lawgokr',
          raw_text: rawText,
          content_hash: contentHash,
        },
        { onConflict: 'law_key' }
      )
      .select('id, content_hash')
      .single()

    if (!lawRow) {
      stats.failure++
      continue
    }
    stats.resolved++

    // content_hash 동일 + not force → 청크/임베딩 생략
    const { count: existingChunks } = await db
      .from('law_chunks')
      .select('id', { count: 'exact', head: true })
      .eq('law_id', lawRow.id)

    if (!ARGS.force && existingChunks && existingChunks > 0) {
      console.log(`[skip] ${group.canonical} (이미 ${existingChunks} 청크)`)
      continue
    }

    // 조문 → 청크
    const chunks = []
    let idx = 0
    for (const art of whole.articles) {
      for (const piece of splitArticle(art.content)) {
        chunks.push({
          chunk_index: idx++,
          article_no: art.article_ref,
          article_title: art.title,
          content: `${art.article_ref} ${art.title ?? ''}\n${piece}`.trim(),
          kind: 'article',
        })
      }
    }

    // 임베딩
    let embeddings
    try {
      embeddings = await embedDocuments(chunks.map((c) => c.content))
    } catch (e) {
      console.warn('[embed] error', group.canonical, e.message)
      await db.from('law_match_failures').insert({
        law_name: group.canonical, api_target: 'law', reason: `임베딩 실패: ${e.message}`,
      })
      stats.failure++
      continue
    }

    // 기존 청크 교체 후 삽입
    await db.from('law_chunks').delete().eq('law_id', lawRow.id)
    const rows = chunks.map((c, i) => ({
      law_id: lawRow.id,
      chunk_index: c.chunk_index,
      article_no: c.article_no,
      article_title: c.article_title,
      content: c.content,
      embedding: embeddings[i],
      metadata: { kind: c.kind },
    }))
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50)
      const { error } = await db.from('law_chunks').insert(batch)
      if (error) throw new Error(`law_chunks insert: ${error.message}`)
    }
    stats.embedded += rows.length

    // 참고서가 인용한 조문을 law_references 로 기록
    for (const cand of group.candidates) {
      await db.from('law_references').insert({
        source_document_id: cand.in_hwpx ? hwpxDocId : pdfDocId,
        law_name: cand.law_name,
        canonical_law_name: cand.canonical_law_name,
        article_ref: cand.article_ref,
        api_target: 'law',
        law_id: top.law_id || null,
        mst: top.mst || null,
        source_anchor: cand.source_anchor,
        confidence: cand.confidence,
        match_status: 'resolved',
        raw_context: cand.raw_context,
      })
    }

    console.log(`[ok] ${group.canonical} → ${rows.length} chunks`)
  }

  // 4) 감사 로그
  await db.from('law_ingestion_runs').insert({
    finished_at: new Date().toISOString(),
    source_pdf_candidates: pdfExtract?.candidates.length ?? 0,
    source_hwpx_candidates: hwpxExtract?.candidates.length ?? 0,
    candidate_count: stats.candidate,
    resolved_count: stats.resolved,
    failure_count: stats.failure,
    embedded_count: stats.embedded,
    duration_ms: Date.now() - t0,
    model: 'gemini-embedding-001',
    embedding_dim: 768,
  })

  console.log('[ingest-laws] done', stats, `${Date.now() - t0}ms`)
}

main().catch((e) => {
  console.error('[ingest-laws] FATAL', e)
  process.exit(1)
})
