'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, MessageSquare, Search, Settings, LogOut, ShieldCheck } from 'lucide-react'
import { clsx } from 'clsx'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const NAV_ITEMS = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/documents', label: '문서 관리', icon: FileText },
  { href: '/chat', label: 'AI 질문', icon: MessageSquare },
  { href: '/search', label: '문서 검색', icon: Search },
]

interface SidebarProps {
  role?: 'engineer' | 'manager' | 'admin'
}

export function Sidebar({ role = 'engineer' }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-sidebar bg-white border-r border-gray-200 flex flex-col z-30">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">KRCTech</p>
            <p className="text-xs text-gray-400 leading-tight">DocAI</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          )
        })}

        {/* Admin menu */}
        {role === 'admin' && (
          <div className="pt-3 mt-3 border-t border-gray-100">
            <p className="px-3 pb-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">
              관리자
            </p>
            <Link
              href="/admin"
              className={clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium transition-colors',
                pathname === '/admin' || pathname.startsWith('/admin/')
                  ? 'bg-primary-light text-primary'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              )}
            >
              <ShieldCheck size={18} />
              관리자 패널
            </Link>
          </div>
        )}
      </nav>

      {/* Bottom actions */}
      <div className="px-3 py-4 border-t border-gray-100 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <Settings size={18} />
          설정
        </Link>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-btn text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors"
        >
          <LogOut size={18} />
          로그아웃
        </button>
      </div>
    </aside>
  )
}
