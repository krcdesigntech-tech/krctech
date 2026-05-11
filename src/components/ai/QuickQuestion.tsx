'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'

export function QuickQuestion() {
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/bot/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })
      if (!res.ok) {
        const body = await res.json()
        throw new Error(body.error ?? '질문 제출에 실패했습니다.')
      }
      router.push('/ai?tab=bot')
    } catch (err) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="문서나 법령에 대해 궁금한 점을 질문하세요..."
        rows={2}
        maxLength={2000}
        disabled={submitting}
        className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent disabled:bg-gray-50 disabled:cursor-not-allowed"
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
      <div className="flex justify-end">
        <Button type="submit" loading={submitting} disabled={!question.trim()}>
          봇에게 질문하기
        </Button>
      </div>
    </form>
  )
}
