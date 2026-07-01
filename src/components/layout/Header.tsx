'use client'

import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  subtitle?: string
  rightLabel?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, rightLabel, actions }: HeaderProps) {
  return (
    <header className="min-h-14 bg-white border-b border-gray-200 flex items-center justify-between gap-4 px-6 py-2">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold text-gray-900 truncate">{title}</h1>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {rightLabel && (
          <span className="hidden sm:inline text-[10px] text-gray-400 tracking-wide">{rightLabel}</span>
        )}
        {actions}
        <button className="p-2 rounded-btn text-gray-500 hover:bg-gray-100 transition-colors relative">
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}
