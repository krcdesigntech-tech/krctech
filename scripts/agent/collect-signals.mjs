/**
 * 자가학습 신호 수집 (읽기 전용). 야간 루프/Hermes가 먼저 호출.
 *   npm run agent:collect -- --limit 100 --since 7
 * 출력: JSON { window, negative_feedback, empty_or_lowscore, open_failures, summary }
 */
import { db, args } from './_shared.mjs'

const A = args()
const LIMIT = parseInt(A.limit ?? '100', 10)
const SINCE_DAYS = parseInt(A.since ?? '14', 10)
const LOW_SCORE = parseFloat(A['low-score'] ?? '0.55')

const sinceIso = new Date(Date.now() - SINCE_DAYS * 86400000).toISOString()

async function main() {
  const sb = db()

  // 부정 피드백이 달린 질문
  const { data: fb } = await sb
    .from('qa_feedback')
    .select('rating, note, created_at, qa_logs(id, question, top_score, sources, status)')
    .in('rating', ['down', 'insufficient'])
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  // 0결과/저점수 질문
  const { data: weak } = await sb
    .from('qa_logs')
    .select('id, question, top_score, status, retrieval_count, created_at')
    .gte('created_at', sinceIso)
    .or(`status.eq.empty,top_score.lt.${LOW_SCORE}`)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  // 미해결 법령 매칭 실패 큐
  const { data: failures } = await sb
    .from('law_match_failures')
    .select('id, law_name, article_ref, api_target, reason, candidate_hits, created_at')
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(LIMIT)

  const result = {
    window: { since: sinceIso, days: SINCE_DAYS, limit: LIMIT, low_score: LOW_SCORE },
    negative_feedback: (fb ?? []).map((f) => ({
      rating: f.rating,
      note: f.note,
      question: f.qa_logs?.question,
      top_score: f.qa_logs?.top_score,
      qa_log_id: f.qa_logs?.id,
    })),
    empty_or_lowscore: weak ?? [],
    open_failures: failures ?? [],
    summary: {
      negative_feedback: (fb ?? []).length,
      empty_or_lowscore: (weak ?? []).length,
      open_failures: (failures ?? []).length,
    },
  }
  console.log(JSON.stringify(result, null, 2))
}

main().catch((e) => { console.error('[collect-signals] FATAL', e); process.exit(1) })
