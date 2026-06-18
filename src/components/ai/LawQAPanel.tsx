'use client'

import { useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Scale, Send, BookOpen } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

interface LawSource {
  law_name: string
  article_no: string | null
  similarity: number
  score: number
  source: string
  snippet: string
}

const EXAMPLES = [
  '지표조사 대상과 근거 조문은?',
  '전략환경영향평가 대상계획은?',
  '하천점용허가 신청 근거는?',
  '환경영향평가법 제9조 내용은?',
]

export function LawQAPanel() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<LawSource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  async function ask(q: string) {
    const query = q.trim()
    if (!query || loading) return

    setLoading(true)
    setError(null)
    setAnswer('')
    setSources([])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const res = await fetch('/api/legal/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query }),
        signal: controller.signal,
      })

      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `요청 실패 (HTTP ${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const t = line.trim()
          if (!t.startsWith('data:')) continue
          const payload = t.slice(5).trim()
          if (!payload) continue
          try {
            const ev = JSON.parse(payload)
            if (ev.type === 'sources') setSources(ev.sources || [])
            else if (ev.type === 'chunk') setAnswer((prev) => prev + ev.content)
            else if (ev.type === 'error') setError(ev.message)
          } catch {
            /* ignore partial */
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') {
        setError((e as Error).message)
      }
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  return (
    <div className="space-y-4">
      {/* 질문 입력 */}
      <Card padding="md">
        <form
          onSubmit={(e) => {
            e.preventDefault()
            ask(question)
          }}
          className="flex gap-2"
        >
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="관계법령을 질문하세요. 예) 지표조사 대상과 근거 조문은?"
            className="flex-1 px-3.5 py-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !question.trim()}
            className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {loading ? <Spinner size="sm" /> : <Send size={15} />}
            질문
          </button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => {
                setQuestion(ex)
                ask(ex)
              }}
              disabled={loading}
              className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-40 transition-colors"
            >
              {ex}
            </button>
          ))}
        </div>
      </Card>

      {error && (
        <Card padding="md" className="border border-red-100 bg-red-50">
          <p className="text-sm text-red-700">{error}</p>
        </Card>
      )}

      {/* 답변 */}
      {(answer || loading) && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-7 h-7 bg-primary-light rounded-lg flex items-center justify-center">
              <Scale size={15} className="text-primary" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">AI 답변</h3>
          </div>
          {answer ? (
            <div className="prose prose-sm max-w-none text-gray-800">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Spinner size="sm" /> 근거 조문을 검색하고 답변을 생성 중입니다…
            </div>
          )}
        </Card>
      )}

      {/* 출처 */}
      {sources.length > 0 && (
        <Card padding="md">
          <div className="flex items-center gap-2 mb-3">
            <BookOpen size={15} className="text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">근거 조문 ({sources.length})</h3>
          </div>
          <div className="space-y-2">
            {sources.map((s, i) => (
              <div key={i} className="p-3 rounded-lg bg-gray-50 border border-gray-100">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    「{s.law_name}」 {s.article_no ?? ''}
                  </p>
                  <span className="text-xs text-gray-400 shrink-0">
                    {Math.round(s.similarity * 100)}%
                    {s.source === 'source_only' && ' · 전문 미확인'}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{s.snippet}</p>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
