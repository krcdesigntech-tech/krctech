export const dynamic = 'force-dynamic'

import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar />
      <div className="pl-sidebar">
        {children}
      </div>
    </div>
  )
}
