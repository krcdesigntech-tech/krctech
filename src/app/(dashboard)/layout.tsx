export const dynamic = 'force-dynamic'

import { getCurrentUser, getCurrentProfile } from '@/lib/supabase/auth'
import { Sidebar } from '@/components/layout/Sidebar'
import { MobileNav } from '@/components/layout/MobileNav'
import { PageViewTracker } from '@/components/PageViewTracker'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser()

  let role: 'engineer' | 'manager' | 'admin' = 'engineer'
  if (user) {
    const profile = await getCurrentProfile()
    if (profile?.role === 'admin' || profile?.role === 'manager') {
      role = profile.role
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PageViewTracker />
      <Sidebar role={role} />
      <div className="md:pl-sidebar pb-16 md:pb-0">
        {children}
      </div>
      <MobileNav />
    </div>
  )
}
