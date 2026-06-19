'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, FileText, Search, Settings, Scale } from 'lucide-react'
import { clsx } from 'clsx'

const NAV_ITEMS = [
  { href: '/dashboard', label: '홈', icon: Home },
  { href: '/legal', label: '법령AI', icon: Scale },
  { href: '/documents', label: '문서', icon: FileText },
  { href: '/search', label: '검색', icon: Search },
  { href: '/settings', label: '설정', icon: Settings },
]

function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex">
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = isNavActive(href, pathname)
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            <Icon size={20} />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
