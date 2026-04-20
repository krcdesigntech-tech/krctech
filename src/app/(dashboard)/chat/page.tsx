'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import useSWR from 'swr'
import { Plus, MessageSquare, ChevronRight } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'
import type { ChatSession } from '@/types/database.types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export default function ChatListPage() {
  const router = useRouter()
  const [creating, setCreating] = useState(false)
  const { data, isLoading } = useSWR<{ sessions: ChatSession[] }>('/api/chat', fetcher)
  const sessions = data?.sessions || []

  async function createSession() {
    setCreating(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '새 대화' }),
      })
      const { session } = await res.json()
      router.push(`/chat/${session.id}`)
    } finally {
      setCreating(false)
    }
  }

  return (
    <div>
      <Header
        title="AI 질문"
        actions={
          <Button icon={<Plus size={16} />} loading={creating} onClick={createSession}>
            새 대화 시작
          </Button>
        }
      />
      <div className="max-w-container mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : sessions.length === 0 ? (
          <Card padding="lg" className="text-center py-16">
            <MessageSquare size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">아직 대화가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              업로드된 문서를 기반으로 AI에게 질문해보세요.
            </p>
            <Button className="mt-4" icon={<Plus size={16} />} loading={creating} onClick={createSession}>
              첫 대화 시작하기
            </Button>
          </Card>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <Link key={session.id} href={`/chat/${session.id}`}>
                <Card hover padding="sm" className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-primary-light rounded-lg flex items-center justify-center shrink-0">
                    <MessageSquare size={18} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{session.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      메시지 {session.message_count}개 ·{' '}
                      {new Date(session.updated_at).toLocaleDateString('ko-KR', {
                        month: 'long',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <ChevronRight size={18} className="text-gray-300 shrink-0" />
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
