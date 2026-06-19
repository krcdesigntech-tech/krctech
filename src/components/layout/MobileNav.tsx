'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Settings, type LucideIcon } from 'lucide-react'
import { clsx } from 'clsx'

type NavItem = {
  href: string
  label: string
  iconSrc?: string
  icon?: LucideIcon
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '홈', iconSrc: '/icons/nav-home.png' },
  { href: '/legal', label: '법령AI', iconSrc: '/icons/nav-legal-ai.png' },
  { href: '/documents', label: '문서', iconSrc: '/icons/nav-documents.png' },
  { href: '/search', label: '검색', iconSrc: '/icons/nav-search.png' },
  { href: '/settings', label: '설정', icon: Settings },
]

function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function MobileNav() {
  const pathname = usePathname()

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 flex">
      {NAV_ITEMS.map((item) => {
        const isActive = isNavActive(item.href, pathname)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={clsx(
              'flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors',
              isActive ? 'text-primary' : 'text-gray-500 hover:text-gray-700'
            )}
          >
            {item.iconSrc ? (
              <Image
                src={item.iconSrc}
                alt=""
                aria-hidden="true"
                width={24}
                height={24}
                className={clsx(
                  'h-6 w-6 shrink-0 rounded-md object-cover transition-opacity',
                  isActive ? 'opacity-100' : 'opacity-75'
                )}
              />
            ) : Icon ? (
              <Icon size={20} />
            ) : (
              null
            )}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
