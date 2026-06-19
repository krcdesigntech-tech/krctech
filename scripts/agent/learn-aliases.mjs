/**
 * 별칭 자동 학습 (저위험 자동). 참고서가 쓴 법령명(law_references)을 정식명/law_id로 매핑해
 * law_aliases에 upsert. 한 번의 실패가 아니라 resolved 매핑만 사용.
 *   npm run agent:improve  (개선 루프에서 호출) / 단독: node scripts/agent/learn-aliases.mjs --dry-run
 */
import { db, args } from './_shared.mjs'
import { normalizeLawName } from '../../src/lib/law/name-canonicalizer.ts'

export async function learnAliases(sb, dry = false) {
  // resolved 참조에서 (참고서 표기 → 정식명/law_id) 후보 추출
  const { data: refs } = await sb
    .from('law_references')
    .select('law_name, canonical_law_name, law_id, mst, match_status')
    .eq('match_status', 'resolved')

  // 적재된 법령(정식명 → law_id) 맵
  const { data: laws } = await sb
    .from('laws')
    .select('law_id, mst, law_name, canonical_law_name')

  const lawByCanon = new Map()
  for (const l of laws ?? []) {
    if (l.canonical_law_name) lawByCanon.set(normalizeLawName(l.canonical_law_name), l)
    if (l.law_name) lawByCanon.set(normalizeLawName(l.law_name), l)
  }

  const candidates = new Map() // alias(normalized) → row
  for (const r of refs ?? []) {
    const canon = r.canonical_law_name || r.law_name
    if (!r.law_name || !canon) continue
    const aliasNorm = normalizeLawName(r.law_name)
    const canonNorm = normalizeLawName(canon)
    if (!aliasNorm || aliasNorm === canonNorm) continue // 동일하면 별칭 불필요
    const law = lawByCanon.get(canonNorm)
    candidates.set(aliasNorm, {
      alias: r.law_name.trim(),
      canonical_law_name: canon,
      law_id: r.law_id || law?.law_id || null,
      mst: r.mst || law?.mst || null,
      api_target: 'law',
      confidence: 0.9,
    })
  }

  const rows = [...candidates.values()]
  console.log(`[learn-aliases] 후보 ${rows.length}건`)
  if (dry) {
    rows.slice(0, 30).forEach((r) => console.log(`  ${r.alias} → ${r.canonical_law_name}`))
    return { upserted: 0, candidates: rows.length }
  }

  let upserted = 0
  for (const r of rows) {
    const { error } = await sb.from('law_aliases').upsert(r, { onConflict: 'alias' })
    if (!error) upserted++
  }
  console.log(`[learn-aliases] upsert ${upserted}건`)
  return { upserted, candidates: rows.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const A = args()
  learnAliases(db(), !!A['dry-run']).catch((e) => {
    console.error('[learn-aliases] FATAL', e)
    process.exit(1)
  })
}
