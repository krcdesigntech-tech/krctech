/**
 * 승인된 제안 적용 (관리자 승인 후에만). idempotent, --dry-run 기본 권장.
 *   node scripts/agent/apply-proposal.mjs --id <uuid> [--dry-run]
 *   node scripts/agent/apply-proposal.mjs --all-approved [--dry-run]
 * status='approved'만 적용 → applied/failed + result 기록.
 */
import { db, args } from './_shared.mjs'
import { ingestOneLaw } from './ingest-one-law.mjs'

const A = args()
const DRY = !!A['dry-run']

async function applyOne(sb, p) {
  if (p.status !== 'approved') return { ok: false, reason: `status=${p.status} (approved만 적용)` }
  const payload = p.payload || {}

  if (DRY) {
    if (p.kind === 'add_law') return await ingestOneLaw(sb, { name: payload.law_name, lawId: payload.law_id }, true)
    return { ok: true, dry: true, kind: p.kind }
  }

  let result
  try {
    switch (p.kind) {
      case 'add_law':
      case 'reembed_law':
        result = await ingestOneLaw(sb, { name: payload.law_name, lawId: payload.law_id || payload.lawId }, false)
        break
      case 'add_alias':
        await sb.from('law_aliases').upsert(
          {
            alias: payload.alias,
            canonical_law_name: payload.canonical_law_name || payload.alias,
            law_id: payload.canonical_law_id || payload.law_id || null,
            api_target: 'law',
            confidence: 0.9,
          },
          { onConflict: 'alias' }
        )
        result = { ok: true, alias: payload.alias }
        break
      case 'note':
        result = { ok: true, note: true }
        break
      default:
        result = { ok: false, reason: `미지원 kind: ${p.kind}` }
    }
  } catch (e) {
    result = { ok: false, reason: e.message }
  }

  await sb
    .from('agent_proposals')
    .update({
      status: result.ok ? 'applied' : 'failed',
      applied_at: new Date().toISOString(),
      result,
    })
    .eq('id', p.id)

  return result
}

async function main() {
  const sb = db()
  let proposals = []
  if (A.id) {
    const { data } = await sb.from('agent_proposals').select('*').eq('id', A.id).single()
    if (data) proposals = [data]
  } else if (A['all-approved']) {
    const { data } = await sb.from('agent_proposals').select('*').eq('status', 'approved')
    proposals = data ?? []
  } else {
    throw new Error('--id <uuid> 또는 --all-approved 필요')
  }

  for (const p of proposals) {
    const r = await applyOne(sb, p)
    console.log(`[apply] ${p.id} ${p.kind} → ${JSON.stringify(r)}`)
  }
}

main().catch((e) => { console.error('[apply-proposal] FATAL', e); process.exit(1) })
