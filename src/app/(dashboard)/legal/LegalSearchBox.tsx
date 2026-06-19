'use client'

import { Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

export function LegalSearchBox({
  initialQuery = '',
  basePath = '/legal/search',
}: {
  initialQuery?: string
  basePath?: string
}) {
  const [value, setValue] = useState(initialQuery)
  const router = useRouter()

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const q = value.trim()
        if (!q) return
        router.push(`${basePath}?q=${encodeURIComponent(q)}`)
      }}
      className="flex items-center gap-2 bg-white border border-gray-200 rounded-card shadow-card px-4 py-3"
    >
      <Search size={18} className="text-gray-400" />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder='법령명, 조문, 업무 항목 검색 (예: "산지전용허가", "환경영향평가법 제9조")'
        className="flex-1 outline-none text-sm placeholder:text-gray-400"
      />
      <button
        type="submit"
        className="text-sm font-medium px-3 py-1.5 rounded-btn bg-primary text-white hover:opacity-90 transition-opacity"
      >
        검색
      </button>
    </form>
  )
}
