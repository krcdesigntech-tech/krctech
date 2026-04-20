'use client'

import { Bell } from 'lucide-react'

interface HeaderProps {
  title: string
  actions?: React.ReactNode
}

export function Header({ title, actions }: HeaderProps) {
  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
      <div className="flex items-center gap-2">
        {actions}
        <button className="p-2 rounded-btn text-gray-500 hover:bg-gray-100 transition-colors relative">
          <Bell size={18} />
        </button>
      </div>
    </header>
  )
}
