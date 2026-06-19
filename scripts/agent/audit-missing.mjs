/**
 * 누락 법령 감사: 미해결 실패큐의 문장조각에서 끝 법령명 토큰을 추출 → 법제처 정확검색 →
 * 코퍼스 대조 → '코퍼스에 없는 실제 법령' 목록 산출.
 *   node scripts/agent/audit-missing.mjs            # 읽기전용 목록
 *   node scripts/agent/audit-missing.mjs --ingest   # 발견분 실제 적재
 *   node scripts/agent/audit-missing.mjs --propose  # agent_proposals 로 제안만
 */
import { readFileSync } from 'node:fs'
import { db, args, sleep } from './_shared.mjs'
import { searchLaw, extractLawToken, pickBestHit } from '../lib/lawgokr.mjs'
import { normalizeLawName } from '../../src/lib/law/name-canonicalizer.ts'
import { extractPdfSource, extractHwpxSource, mergeCandidates } from '../../src/lib/law/source-extractors.ts'
import { ingestOneLaw } from './ingest-one-law.mjs'
import { propose } from './propose.mjs'

const A = args()
const MODE = A.ingest ? 'ingest' : A.propose ? 'propose' : 'list'

async function main() {
  const sb = db()

  // 코퍼스 보유 법령 집합
  const { data: laws } = await sb.from('laws').select('law_id, law_name, canonical_law_name')
  const haveId = new Set((laws ?? []).map((l) => l.law_id).filter(Boolean))
  const haveName = new Set()
  for (const l of laws ?? []) {
    if (l.law_name) haveName.add(normalizeLawName(l.law_name))
    if (l.canonical_law_name) haveName.add(normalizeLawName(l.canonical_law_name))
  }

  // 후보 토큰 수집: (a) 실패큐 끝-토큰  +  (b) --from-source 시 원본 참고서 「…」 법령명
  const tokens = new Set()

  const { data: failures } = await sb
    .from('law_match_failures')
    .select('law_name')
    .is('resolved_at', null)
    .eq('api_target', 'law')
  for (const f of failures ?? []) {
    const tok = extractLawToken(f.law_name)
    const n = normalizeLawName(tok)
    if (n.length >= 4 && /(법|법률|시행령|시행규칙)$/.test(n)) tokens.add(tok.trim())
  }

  if (A['from-source']) {
    const pdf = A.pdf ? await extractPdfSource(readFileSync(A.pdf)) : null
    const hwpx = A.hwpx ? await extractHwpxSource(readFileSync(A.hwpx)) : null
    const merged = mergeCandidates(pdf?.candidates ?? [], hwpx?.candidates ?? [])
    for (const c of merged) {
      if (c.api_target !== 'law') continue
      const tok = extractLawToken(c.canonical_law_name || c.law_name)
      const n = normalizeLawName(tok)
      if (n.length >= 4 && /(법|법률|시행령|시행규칙)$/.test(n)) tokens.add(tok.trim())
    }
    console.log(`[audit] 원본 참고서 후보 포함`)
  }

  console.log(`[audit] 고유 후보 토큰 ${tokens.size}개 검증 중...`)

  const missing = new Map() // law_id → {name, law_id}
  let checked = 0
  for (const tok of tokens) {
    checked++
    let hits = []
    try { hits = await searchLaw(tok) } catch { /* skip */ }
    await sleep(140)
    const hit = pickBestHit(hits, tok)
    if (!hit || !hit.law_id) continue
    if (haveId.has(hit.law_id) || haveName.has(normalizeLawName(hit.name))) continue
    if (!missing.has(hit.law_id)) missing.set(hit.law_id, { name: hit.name, law_id: hit.law_id })
  }

  const list = [...missing.values()]
  console.log(`\n[audit] 코퍼스 누락(법제처 확인) 법령 ${list.length}건:`)
  list.forEach((m) => console.log(`  - ${m.name} (${m.law_id})`))

  if (MODE === 'ingest') {
    console.log('\n[audit] 적재 시작...')
    let ok = 0
    for (const m of list) {
      const r = await ingestOneLaw(sb, { lawId: m.law_id }, false)
      console.log(`  ${r.ok ? '✓' : '✗'} ${m.name} ${r.ok ? `(${r.chunks} chunks)` : r.reason}`)
      if (r.ok) ok++
    }
    console.log(`[audit] 적재 완료 ${ok}/${list.length}`)
  } else if (MODE === 'propose') {
    for (const m of list) {
      await propose(sb, {
        kind: 'add_law',
        payload: { law_name: m.name, law_id: m.law_id },
        rationale: '실패큐 끝-토큰 추출 + 법제처 정확검색으로 확인된 누락 법령',
        risk: 'high',
      })
    }
    console.log(`[audit] 제안 ${list.length}건 생성`)
  }
}

main().catch((e) => { console.error('[audit-missing] FATAL', e); process.exit(1) })
