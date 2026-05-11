'use client'

export const dynamic = 'force-dynamic'

import { useSearchParams, useRouter } from 'next/navigation'
import { Suspense } from 'react'
import { Header } from '@/components/layout/Header'
import { ChatSessionsPanel } from '@/components/ai/ChatSessionsPanel'
import { BotQuestionsPanel } from '@/components/ai/BotQuestionsPanel'

function AIAssistantContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const tab = searchParams.get('tab') === 'bot' ? 'bot' : 'chat'

  return (
    <div>
      <Header title="AI 어시스턴트" />

      {/* Tab switcher */}
      <div className="bg-white border-b border-gray-200 px-6">
        <div className="max-w-container mx-auto flex gap-0">
          {(['chat', 'bot'] as const).map((t) => (
            <button
              key={t}
              onClick={() => router.replace(`/ai?tab=${t}`)}
              className={`px-5 py-3.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {t === 'chat' ? '채팅' : '봇 Q&A'}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div className="max-w-container mx-auto px-6 py-6">
        {tab === 'chat' ? <ChatSessionsPanel /> : <BotQuestionsPanel />}
      </div>
    </div>
  )
}

export default function AIPage() {
  return (
    <Suspense fallback={null}>
      <AIAssistantContent />
    </Suspense>
  )
}
