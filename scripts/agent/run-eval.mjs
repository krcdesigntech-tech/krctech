/**
 * 회귀 평가: fixtures/law-qa-eval.json 으로 검색 품질 측정 후 eval_runs 기록.
 *   npm run agent:eval [-- --k 5]
 * 직전 eval_run 대비 law_hit_rate 하락 시 note 제안 생성(경고).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, args } from './_shared.mjs'
import { embedQuery } from '../../src/lib/llm/hf-embeddings.ts'
import { parseLegalQuery } from '../../src/lib/law/query-parser.ts'
import { propose } from './propose.mjs'

const A = args()
const K = parseInt(A.k ?? '5', 10)
const norm = (s) => (s || '').replace(/\s+/g, '').replace(/[「」]/g, '')

async function main() {
  const sb = db()
  const fixture = JSON.parse(readFileSync(resolve('fixtures/law-qa-eval.json'), 'utf8'))
  const items = fixture.items || []

  let lawHit = 0, articleHit = 0, articleTotal = 0
  for (const it of items) {
    const parsed = parseLegalQuery(it.question)
    const v = await embedQuery(it.question)
    const { data, error } = await sb.rpc('match_law_chunks', {
      query_embedding: v, match_count: K, query_text: it.question,
      law_name_filter: parsed.lawName, article_filter: parsed.articleRef,
    })
    if (error) throw new Error(error.message)
    const rows = data || []
    const expected = norm(it.expected_law)
    if (rows.some((r) => (norm(r.law_name) + norm(r.canonical_law_name)).includes(expected))) lawHit++
    if (it.expected_article) {
      articleTotal++
      if (rows.some((r) => norm(r.article_no) === norm(it.expected_article))) articleHit++
    }
  }

  const total = items.length
  const lawRate = total ? lawHit / total : 0
  const artRate = articleTotal ? articleHit / articleTotal : null

  await sb.from('eval_runs').insert({
    total, law_hit: lawHit, article_hit: articleHit,
    law_hit_rate: lawRate, article_hit_rate: artRate, k: K,
  })

  // 직전 대비 회귀 감지
  const { data: prev } = await sb
    .from('eval_runs').select('law_hit_rate').order('created_at', { ascending: false }).range(1, 1)
  const prevRate = prev?.[0]?.law_hit_rate
  console.log(`law top-${K} hit: ${lawHit}/${total} (${Math.round(lawRate * 100)}%)`)
  if (artRate != null) console.log(`article exact: ${articleHit}/${articleTotal} (${Math.round(artRate * 100)}%)`)

  if (typeof prevRate === 'number' && lawRate < prevRate - 0.05) {
    console.warn(`⚠ 회귀 감지: ${Math.round(prevRate * 100)}% → ${Math.round(lawRate * 100)}%`)
    await propose(sb, {
      kind: 'note',
      payload: { type: 'eval_regression', prev: prevRate, now: lawRate },
      rationale: `eval law_hit_rate 회귀: ${(prevRate * 100).toFixed(0)}% → ${(lawRate * 100).toFixed(0)}%`,
      risk: 'low',
    })
  }
}

main().catch((e) => { console.error('[run-eval] FATAL', e); process.exit(1) })
