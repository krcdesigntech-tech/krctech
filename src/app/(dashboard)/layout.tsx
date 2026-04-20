export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/layout/Sidebar'
import { PageViewTracker } from '@/components/PageViewTracker'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let role: 'engineer' | 'manager' | 'admin' = 'engineer'
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    if (profile?.role === 'admin' || profile?.role === 'manager') {
      role = profile.role
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageViewTracker />
      <Sidebar role={role} />
      <div className="pl-sidebar">
        {children}
      </div>
    </div>
  )
}
