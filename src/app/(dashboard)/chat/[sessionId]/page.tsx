'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useRef, use } from 'react'
import useSWR from 'swr'
import ReactMarkdown from 'react-markdown'
import { Send, FileText, ChevronDown, ChevronUp, Bot, User } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Spinner } from '@/components/ui/Spinner'
import { CategoryBadge } from '@/components/ui/Badge'
import type { ChatMessage, Document, MatchedChunk } from '@/types/database.types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface MessageWithSources extends ChatMessage {
  source_chunks: MatchedChunk[]
}

function SourceCitations({ chunks }: { chunks: MatchedChunk[] }) {
  const [open, setOpen] = useState(false)
  if (!chunks?.length) return null

  return (
    <div className="mt-3 border border-gray-100 rounded-btn overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 transition-colors"
      >
        <span className="font-medium">📎 참조 문서 {chunks.length}건</span>
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
      </button>
      {open && (
        <div className="divide-y divide-gray-50">
          {chunks.map((chunk, i) => (
            <div key={i} className="px-3 py-2.5 bg-gray-50">
              <div className="flex items-center gap-2 mb-1.5">
                <FileText size={12} className="text-gray-400" />
                <span className="text-xs font-medium text-gray-700">{chunk.document_name}</span>
                {chunk.page_number && (
                  <span className="text-xs text-gray-400">p.{chunk.page_number}</span>
                )}
                <CategoryBadge category={chunk.document_category} />
                <span className="text-xs text-gray-400 ml-auto">
                  유사도 {(chunk.similarity * 100).toFixed(0)}%
                </span>
              </div>
              <p className="text-xs text-gray-500 line-clamp-3 leading-relaxed">
                {chunk.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function MessageBubble({ message }: { message: MessageWithSources }) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isUser ? 'bg-primary' : 'bg-gray-100'
        }`}
      >
        {isUser ? (
          <User size={16} className="text-white" />
        ) : (
          <Bot size={16} className="text-gray-500" />
        )}
      </div>
      <div className={`max-w-[80%] ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
            isUser
              ? 'bg-primary text-white rounded-tr-sm'
              : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-card'
          }`}
        >
          {isUser ? (
            <p>{message.content}</p>
          ) : (
            <div className="prose-chat">
              <ReactMarkdown>{message.content}</ReactMarkdown>
            </div>
          )}
        </div>
        {!isUser && message.source_chunks?.length > 0 && (
          <div className="w-full mt-1">
            <SourceCitations chunks={message.source_chunks} />
          </div>
        )}
        <span className="text-xs text-gray-400 mt-1 px-1">
          {new Date(message.created_at).toLocaleTimeString('ko-KR', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      </div>
    </div>
  )
}

function StreamingBubble({ content }: { content: string }) {
  return (
    <div className="flex gap-3">
      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <Bot size={16} className="text-gray-500" />
      </div>
      <div className="max-w-[80%]">
        <div className="px-4 py-3 rounded-2xl rounded-tl-sm bg-white border border-gray-200 text-sm text-gray-800 shadow-card">
          {content ? (
            <div className="prose-chat">
              <ReactMarkdown>{content}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChatSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>
}) {
  const { sessionId } = use(params)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamContent, setStreamContent] = useState('')
  const [, setStreamChunks] = useState<MatchedChunk[]>([])
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const { data: messagesData, mutate } = useSWR<{ messages: MessageWithSources[] }>(
    `/api/chat/${sessionId}/messages`,
    fetcher
  )
  const { data: docsData } = useSWR<{ documents: Document[] }>('/api/documents?status=ready', fetcher)

  const messages = messagesData?.messages || []
  const readyDocs = docsData?.documents || []
  const messageCount = messages.length

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messageCount, streaming, streamContent])

  async function handleSend() {
    const content = input.trim()
    if (!content || streaming) return

    setInput('')
    setStreaming(true)
    setStreamContent('')
    setStreamChunks([])

    try {
      const res = await fetch(`/api/chat/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, documentIds: selectedDocIds }),
      })

      if (!res.body) throw new Error('스트리밍 응답 오류')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const text = decoder.decode(value)
        const lines = text.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const event = JSON.parse(line.slice(6))
            if (event.type === 'chunk') {
              setStreamContent((prev) => prev + event.content)
            } else if (event.type === 'sources') {
              setStreamChunks(event.chunks)
            } else if (event.type === 'done' || event.type === 'error') {
              await mutate()
            }
          } catch {}
        }
      }
    } finally {
      setStreaming(false)
      setStreamContent('')
      setStreamChunks([])
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <Header title="AI 질문" />

      {/* Document filter */}
      {readyDocs.length > 0 && (
        <div className="bg-white border-b border-gray-100 px-6 py-2.5 flex items-center gap-2 overflow-x-auto">
          <span className="text-xs text-gray-500 shrink-0 font-medium">범위:</span>
          <button
            onClick={() => setSelectedDocIds([])}
            className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedDocIds.length === 0
                ? 'bg-primary text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            전체 문서
          </button>
          {readyDocs.map((doc) => (
            <button
              key={doc.id}
              onClick={() =>
                setSelectedDocIds((prev) =>
                  prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id]
                )
              }
              className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                selectedDocIds.includes(doc.id)
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {doc.original_name.length > 20
                ? doc.original_name.slice(0, 20) + '…'
                : doc.original_name}
            </button>
          ))}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
        {messages.length === 0 && !streaming && (
          <div className="text-center py-16">
            <Bot size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">토목설계 문서에 대해 질문해보세요</p>
            <p className="text-sm text-gray-400 mt-1">
              업로드된 문서를 기반으로 정확한 답변을 드립니다.
            </p>
            <div className="mt-6 flex flex-wrap gap-2 justify-center">
              {[
                '인허가 절차를 단계별로 설명해주세요',
                '설계기준에서 하중 조합 방법은?',
                '시방서의 주요 품질 기준을 요약해주세요',
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="px-3 py-2 bg-white border border-gray-200 rounded-btn text-sm text-gray-600 hover:bg-primary-light hover:border-primary hover:text-primary transition-colors"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}

        {streaming && <StreamingBubble content={streamContent} />}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="bg-white border-t border-gray-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="토목설계 문서에 대해 질문하세요... (Shift+Enter로 줄바꿈)"
              rows={1}
              disabled={streaming}
              className="w-full px-4 py-3 text-sm border border-gray-200 rounded-2xl resize-none
                focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
                disabled:bg-gray-50 disabled:cursor-not-allowed
                scrollbar-thin max-h-32"
              style={{ lineHeight: '1.5' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || streaming}
            className="w-11 h-11 bg-primary rounded-full flex items-center justify-center
              hover:bg-primary-hover transition-colors
              disabled:bg-gray-200 disabled:cursor-not-allowed shrink-0"
          >
            {streaming ? (
              <Spinner size="sm" color="white" />
            ) : (
              <Send size={18} className="text-white" />
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
