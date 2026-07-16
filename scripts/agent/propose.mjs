/**
 * 에이전트 제안 기록 (고위험 변경의 유일한 쓰기 경로). 코퍼스는 직접 안 건드린다.
 *   node scripts/agent/propose.mjs --kind add_law --payload '{"law_name":"지하안전관리에 관한 특별법"}' --rationale "..." --risk high
 * payload는 kind별 최소 검증. 중복 pending 제안은 unique index로 무시됨.
 */
import { db, args } from './_shared.mjs'

const KINDS = ['add_law', 'add_alias', 'recanonicalize', 'reembed_law', 'note']

function validate(kind, payload) {
  switch (kind) {
    case 'add_law':
      if (!payload.law_name && !payload.law_id) return 'add_law: law_name 또는 law_id 필요'
      return null
    case 'add_alias':
      if (!payload.alias || !(payload.canonical_law_name || payload.canonical_law_id))
        return 'add_alias: alias + canonical_law_name|canonical_law_id 필요'
      return null
    case 'recanonicalize':
      if (!payload.from || !payload.to) return 'recanonicalize: from/to 필요'
      return null
    case 'reembed_law':
      if (!payload.law_id) return 'reembed_law: law_id 필요'
      return null
    case 'note':
      return null
    default:
      return 'unknown kind'
  }
}

export async function propose(sb, { kind, payload, rationale, risk = 'medium', evidence = null, createdBy = 'hermes' }) {
  if (!KINDS.includes(kind)) return { ok: false, reason: `kind는 ${KINDS.join('|')} 중 하나` }
  const err = validate(kind, payload || {})
  if (err) return { ok: false, reason: err }

  const { data, error } = await sb
    .from('agent_proposals')
    .insert({ kind, payload: payload || {}, rationale, risk_level: risk, evidence, created_by: createdBy })
    .select('id')
    .single()
  if (error) {
    // unique(dedupe) 위반 = 이미 동일 pending 제안 존재
    if (/duplicate key|unique/i.test(error.message)) return { ok: true, duplicate: true }
    return { ok: false, reason: error.message }
  }
  return { ok: true, id: data.id }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const A = args()
  const payload = A.payload ? JSON.parse(A.payload) : {}
  const evidence = A.evidence ? JSON.parse(A.evidence) : null
  const sb = db()
  propose(sb, { kind: A.kind, payload, rationale: A.rationale, risk: A.risk, evidence })
    .then((r) => { console.log(JSON.stringify(r)); if (!r.ok) process.exit(2) })
    .catch((e) => { console.error('[propose] FATAL', e); process.exit(1) })
}
