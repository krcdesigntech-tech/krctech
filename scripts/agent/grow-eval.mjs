/**
 * 평가셋 자가확장 (저위험 자동). 👍 받은 qa_log 중 출처가 명확하고 top_score 높은 것만
 * fixtures/law-qa-eval.json 에 신규 문항으로 승격. 환각 방지: source exact + 점수 임계.
 *   node scripts/agent/grow-eval.mjs [--dry-run] [--min-score 0.7]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { db, args } from './_shared.mjs'

const A = args()
const DRY = !!A['dry-run']
const MIN_SCORE = parseFloat(A['min-score'] ?? '0.7')
const norm = (s) => (s || '').replace(/\s+/g, '')

async function main() {
  const sb = db()
  const path = resolve('fixtures/law-qa-eval.json')
  const fixture = JSON.parse(readFileSync(path, 'utf8'))
  const existing = new Set((fixture.items || []).map((i) => norm(i.question)))

  // 👍 피드백 + 높은 top_score + 출처 존재한 로그
  const { data: ups } = await sb
    .from('qa_feedback')
    .select('qa_logs(id, question, top_score, sources, status)')
    .eq('rating', 'up')
    .limit(200)

  const added = []
  for (const f of ups ?? []) {
    const log = f.qa_logs
    if (!log || log.status !== 'success') continue
    if ((log.top_score ?? 0) < MIN_SCORE) continue
    if (existing.has(norm(log.question))) continue
    const top = (log.sources || [])[0]
    if (!top?.law_name) continue // 출처 명확성
    added.push({
      question: log.question,
      expected_law: top.law_name,
      expected_article: top.article_no ?? null,
      keywords: [],
      _source: 'grown',
    })
    existing.add(norm(log.question))
  }

  console.log(`[grow-eval] 승격 후보 ${added.length}건 (min_score=${MIN_SCORE})`)
  if (DRY || added.length === 0) {
    added.slice(0, 20).forEach((a) => console.log(`  + ${a.question} → ${a.expected_law} ${a.expected_article ?? ''}`))
    return
  }
  fixture.items = [...(fixture.items || []), ...added]
  writeFileSync(path, JSON.stringify(fixture, null, 2) + '\n')
  console.log(`[grow-eval] fixtures 갱신: 총 ${fixture.items.length}문항`)
}

main().catch((e) => { console.error('[grow-eval] FATAL', e); process.exit(1) })
