/**
 * 자가개선 1회 실행 (저위험 자동 + 고위험 제안). 코퍼스 직접 변경 없음.
 *   npm run agent:improve [-- --dry-run]
 * 절차: 락 획득 → agent_runs(running) → 별칭 자동학습 → 실패큐/저점수에서 add_law 제안 → 요약 기록.
 */
import { db, args, acquireLock, releaseLock, sleep } from './_shared.mjs'
import { learnAliases } from './learn-aliases.mjs'
import { propose } from './propose.mjs'
import { searchLaw } from '../lib/lawgokr.mjs'
import { normalizeLawName } from '../../src/lib/law/name-canonicalizer.ts'

const A = args()
const DRY = !!A['dry-run']
const LOCK = 'krctech-self-learning'

// a 안의 길이 minLen 이상 연속 부분문자열이 b에 존재하는지
function hasOverlap(a, b, minLen = 4) {
  if (!a || !b) return false
  for (let i = 0; i + minLen <= a.length; i++) {
    if (b.includes(a.slice(i, i + minLen))) return true
  }
  return false
}

async function main() {
  const sb = db()
  const got = await acquireLock(sb, LOCK, 'improve', 30)
  if (!got) { console.log('[improve] 다른 실행이 진행 중(lock). 종료.'); return }

  const { data: runRow } = await sb
    .from('agent_runs')
    .insert({ kind: 'improve', status: 'running', provider: 'openrouter', prompt_version: 'agent-v1' })
    .select('id')
    .single()
  const runId = runRow?.id
  const autoActions = {}
  let proposalsCreated = 0

  try {
    // 1) 저위험 자동: 별칭 학습
    const alias = await learnAliases(sb, DRY)
    autoActions.aliases = alias

    // 2) 코퍼스에 이미 있는 법령(정식명 정규화) 집합
    const { data: laws } = await sb.from('laws').select('law_name, canonical_law_name')
    const haveLaw = new Set()
    for (const l of laws ?? []) {
      if (l.canonical_law_name) haveLaw.add(normalizeLawName(l.canonical_law_name))
      if (l.law_name) haveLaw.add(normalizeLawName(l.law_name))
    }

    // 3) 미해결 실패큐(법률) → 코퍼스에 없는 것만 add_law 제안 (고위험, 승인 필요)
    const { data: failures } = await sb
      .from('law_match_failures')
      .select('id, law_name, api_target, reason, candidate_hits')
      .is('resolved_at', null)
      .eq('api_target', 'law')
      .limit(100)

    // 추출 노이즈 제거: 정상 법령명만. 문장 조각(조사·서술어 포함)을 강하게 배제.
    const looksLikeLaw = (name) => {
      const n = (name || '').trim()
      if (!n || n.length > 40) return false
      if (/(조에|같은|항에|호에|따른|발주청|업자|해야|하여|하는|받은|받아|경우)/.test(n)) return false
      if (/(은|는|이|가|을|를|에게|에서|으로)\s/.test(n)) return false // 조사 뒤 공백 = 문장조각
      if ((n.match(/\s/g) || []).length > 4) return false
      return /(법|법률|시행령|시행규칙)$/.test(n.replace(/\s+/g, ''))
    }

    // 후보를 법제처에서 실제 검색해 검증된 정식명/law_id로만 제안 (노이즈 제거 + 사전 해석).
    const MAX_RESEARCH = parseInt(A['max-research'] ?? '40', 10)
    const seen = new Set()
    const proposedLaw = new Set()
    let researched = 0
    for (const f of failures ?? []) {
      if (researched >= MAX_RESEARCH) break
      if (!looksLikeLaw(f.law_name)) continue
      const norm = normalizeLawName(f.law_name || '')
      if (!norm || haveLaw.has(norm) || seen.has(norm)) continue
      seen.add(norm)

      researched++
      let hits = []
      try { hits = await searchLaw(f.law_name) } catch { /* skip */ }
      await sleep(150)
      const hit = hits[0]
      if (!hit || !hit.law_id || !hit.name) continue
      const resName = normalizeLawName(hit.name)
      // 검증: 결과가 실제 법령명이고, 후보와 4자 이상 연속 겹치며, 코퍼스에 없을 것
      if (!/(법|법률|시행령|시행규칙)$/.test(resName)) continue
      if (!hasOverlap(norm, resName, 4)) continue
      if (haveLaw.has(resName) || proposedLaw.has(resName)) continue
      proposedLaw.add(resName)

      if (DRY) { proposalsCreated++; continue }
      const r = await propose(sb, {
        kind: 'add_law',
        payload: { law_name: hit.name, law_id: hit.law_id },
        rationale: `미해결 실패큐 "${f.law_name}" → 법제처 검증 "${hit.name}"(ID ${hit.law_id}). 코퍼스 미존재 → 적재 제안.`,
        risk: 'high',
        evidence: { failure_ids: [f.id] },
      })
      if (r.ok && !r.duplicate) proposalsCreated++
    }

    const summary = `별칭 ${alias.upserted ?? 0}건 학습, add_law 제안 ${proposalsCreated}건 생성${DRY ? ' (dry-run)' : ''}`
    console.log('[improve]', summary)
    if (runId) {
      await sb.from('agent_runs').update({
        status: 'success', finished_at: new Date().toISOString(),
        auto_actions: autoActions, proposals_created: proposalsCreated, summary,
      }).eq('id', runId)
    }
  } catch (e) {
    console.error('[improve] error', e.message)
    if (runId) {
      await sb.from('agent_runs').update({
        status: 'failed', finished_at: new Date().toISOString(), errors: { message: e.message },
      }).eq('id', runId)
    }
  } finally {
    await releaseLock(sb, LOCK)
  }
}

main().catch((e) => { console.error('[improve] FATAL', e); process.exit(1) })
