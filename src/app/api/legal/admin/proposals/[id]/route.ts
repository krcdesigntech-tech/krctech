import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/law/auth'
import { createServiceClient } from '@/lib/supabase/server'

// 에이전트 제안 승인/거부 (관리자 전용). 실제 적용(add_law 등)은 무겁고 길어
// 승인만 기록하고, 적용은 `npm run agent:apply -- --all-approved`(로컬/Hermes)로 수행한다.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: '관리자 권한이 필요합니다.' }, { status: 403 })

  const { action } = await request.json()
  if (!['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'action은 approve|reject' }, { status: 400 })
  }

  const service = await createServiceClient()
  const { data, error } = await service
    .from('agent_proposals')
    .update({
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id, status')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '대기중 제안을 찾을 수 없습니다.' }, { status: 404 })

  return NextResponse.json({ ok: true, status: data.status })
}
