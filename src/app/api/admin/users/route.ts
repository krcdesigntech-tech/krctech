import { NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { z } from 'zod'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return user
}

// GET /api/admin/users — list all users with activity summary
export async function GET() {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceClient = await createServiceClient()

  const { data: profiles, error } = await serviceClient
    .from('profiles')
    .select('id, full_name, email, role, department, avatar_url, created_at')
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Get last login for each user
  const { data: lastLogins } = await serviceClient
    .from('activity_logs')
    .select('user_id, created_at')
    .eq('action', 'login')
    .order('created_at', { ascending: false })

  const lastLoginMap: Record<string, string> = {}
  for (const log of lastLogins ?? []) {
    if (!lastLoginMap[log.user_id]) {
      lastLoginMap[log.user_id] = log.created_at as string
    }
  }

  const users = (profiles ?? []).map((p) => ({
    ...p,
    last_login: lastLoginMap[p.id] ?? null,
  }))

  return NextResponse.json({ users })
}

const UpdateRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['engineer', 'manager', 'admin']),
})

// PATCH /api/admin/users — update user role
export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin()
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await request.json()
  const parsed = UpdateRoleSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: '잘못된 요청입니다.' }, { status: 400 })
  }

  const { userId, role } = parsed.data

  // Prevent admin from demoting themselves
  if (userId === admin.id && role !== 'admin') {
    return NextResponse.json({ error: '자신의 관리자 권한은 변경할 수 없습니다.' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()
  const { error } = await serviceClient
    .from('profiles')
    .update({ role, updated_at: new Date().toISOString() })
    .eq('id', userId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true })
}
