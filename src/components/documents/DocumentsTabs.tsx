'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { DocumentsClient } from './DocumentsClient'
import { LawLibrary } from './LawLibrary'

interface Props {
  isAdmin: boolean
}

export function DocumentsTabs({ isAdmin }: Props) {
  const [tab, setTab] = useState<'uploads' | 'laws'>('uploads')

  return (
    <div>
      <Header
        title="문서"
        actions={
          tab === 'uploads' && isAdmin ? (
            <Link href="/documents/upload">
              <Button icon={<Plus size={16} />}>문서 업로드</Button>
            </Link>
          ) : undefined
        }
      />

      {/* 탭 */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-container mx-auto flex gap-0">
          {([
            ['uploads', '업로드 문서'],
            ['laws', '법령'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'uploads' ? (
        <DocumentsClient isAdmin={isAdmin} embedded />
      ) : (
        <div className="max-w-container mx-auto px-6 py-6">
          <LawLibrary />
        </div>
      )}
    </div>
  )
}
