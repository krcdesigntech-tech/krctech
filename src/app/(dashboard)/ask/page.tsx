'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import useSWR from 'swr'
import { Bot } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface BotQuestion {
  id: string
  question: string
  answer: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  error: string | null
  rag_context: string | null
  created_at: string
  answered_at: string | null
}

function statusLabel(status: string) {
  switch (status) {
    case 'pending':
      return { text: '대기중', cls: 'bg-gray-100 text-gray-600' }
    case 'processing':
      return { text: '처리중', cls: 'bg-amber-100 text-amber-700' }
    case 'completed':
      return { text: '완료', cls: 'bg-green-100 text-green-700' }
    case 'failed':
      return { text: '실패', cls: 'bg-red-100 text-red-700' }
    default:
      return { text: status, cls: 'bg-gray-100 text-gray-600' }
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('ko-KR', {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function AskPage() {
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const { data, isLoading, mutate } = useSWR<{ questions: BotQuestion[] }>(
    '/api/bot/ask',
    fetcher,
    {
      refreshInterval: (data) => {
        const questions = data?.questions ?? []
        const hasActive = questions.some(
          (q) => q.status === 'pending' || q.status === 'processing'
        )
        return hasActive ? 5000 : 0
      },
    }
  )

  const questions = data?.questions ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return

    setSubmitting(true)
    setSubmitError(null)

    try {
      const res = await fetch('/api/bot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? '질문 제출에 실패했습니다.')
      }

      setQuestion('')
      mutate()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div>
      <Header title="AI 봇 질문" />
      <div className="max-w-container mx-auto px-6 py-6 space-y-4">
        {/* Question form */}
        <Card padding="lg">
          <form onSubmit={handleSubmit} className="space-y-3">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="질문을 입력하세요..."
              rows={4}
              disabled={submitting}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
            />
            {submitError && (
              <p className="text-sm text-red-500">{submitError}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" loading={submitting} disabled={!question.trim()}>
                질문하기
              </Button>
            </div>
          </form>
        </Card>

        {/* Questions list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : questions.length === 0 ? (
          <Card padding="lg" className="text-center py-16">
            <Bot size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">아직 질문이 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              위에 질문을 입력하면 AI 봇이 답변해드립니다.
            </p>
          </Card>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => {
              const { text, cls } = statusLabel(q.status)
              return (
                <Card key={q.id} padding="lg">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium text-gray-900 flex-1">{q.question}</p>
                    <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
                      {text}
                    </span>
                  </div>
                  {q.answer && (
                    <div className="prose prose-sm max-w-none mt-3 text-sm text-gray-700 whitespace-pre-wrap">
                      {q.answer}
                    </div>
                  )}
                  {q.error && (
                    <div className="mt-2 text-sm text-red-500">{q.error}</div>
                  )}
                  <div className="mt-2 text-xs text-gray-400">{formatDate(q.created_at)}</div>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
