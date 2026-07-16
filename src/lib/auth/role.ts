import { createClient } from '@/lib/supabase/server'
import type { UserRole } from '@/types/database.types'

export interface UserWithRole {
  user: { id: string; email?: string } | null
  role: UserRole | null
  isAdmin: boolean
}

export async function getCurrentUserWithRole(): Promise<UserWithRole> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, role: null, isAdmin: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  const role = (profile?.role as UserRole) ?? null
  return { user, role, isAdmin: role === 'admin' }
}
