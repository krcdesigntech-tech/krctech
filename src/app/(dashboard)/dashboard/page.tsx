export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { FileText, MessageSquare, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { QuickQuestion } from '@/components/ai/QuickQuestion'
import type { ChatSession, BotQuestion } from '@/types/database.types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [
    { data: sessions },
    { data: profile },
    { data: botQs },
    { count: totalDocs },
    { count: readyDocs },
    { count: processingDocs },
    { count: totalChats },
  ] = await Promise.all([
    supabase.from('chat_sessions').select('id, title, message_count, last_message_at, created_at, updated_at').eq('user_id', user!.id).order('updated_at', { ascending: false }).limit(3),
    supabase.from('profiles').select('full_name, role').eq('id', user!.id).single(),
    supabase.from('bot_questions').select('id, question, answer, status, created_at').eq('user_id', user!.id).order('created_at', { ascending: false }).limit(3),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'ready'),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).in('status', ['uploading', 'processing']),
    supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
  ])

  const chatSessions = (sessions || []) as ChatSession[]
  const botQuestions = (botQs || []) as BotQuestion[]

  function statusLabel(status: string) {
    switch (status) {
      case 'pending': return { text: '대기중', cls: 'bg-gray-100 text-gray-600' }
      case 'processing': return { text: '처리중', cls: 'bg-amber-100 text-amber-700' }
      case 'completed': return { text: '완료', cls: 'bg-green-100 text-green-700' }
      case 'failed': return { text: '실패', cls: 'bg-red-100 text-red-700' }
      default: return { text: status, cls: 'bg-gray-100 text-gray-600' }
    }
  }

  return (
    <div>
      <Header title="홈" />
      <div className="max-w-container mx-auto px-6 py-6">

        {/* Welcome */}
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            안녕하세요, {profile?.full_name || user?.email?.split('@')[0]}님 👋
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            토목설계 문서를 업로드하고 AI에게 질문해보세요.
          </p>
        </div>

        {/* Quick question */}
        <Card padding="md" className="mb-6">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">빠른 질문</h3>
          <QuickQuestion />
        </Card>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card padding="md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">전체 문서</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalDocs ?? 0}</p>
              </div>
              <div className="w-9 h-9 bg-primary-light rounded-lg flex items-center justify-center">
                <FileText size={18} className="text-primary" />
              </div>
            </div>
          </Card>
          <Card padding="md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">준비 완료</p>
                <p className="text-2xl font-bold text-status-success mt-1">{readyDocs ?? 0}</p>
              </div>
              <div className="w-9 h-9 bg-status-success-light rounded-lg flex items-center justify-center">
                <CheckCircle size={18} className="text-status-success" />
              </div>
            </div>
          </Card>
          <Card padding="md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">처리 중</p>
                <p className="text-2xl font-bold text-status-warning mt-1">{processingDocs ?? 0}</p>
              </div>
              <div className="w-9 h-9 bg-status-warning-light rounded-lg flex items-center justify-center">
                <Clock size={18} className="text-status-warning" />
              </div>
            </div>
          </Card>
          <Card padding="md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">AI 대화</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{totalChats ?? 0}</p>
              </div>
              <div className="w-9 h-9 bg-primary-light rounded-lg flex items-center justify-center">
                <MessageSquare size={18} className="text-primary" />
              </div>
            </div>
          </Card>
        </div>

        {/* Recent bot questions + Recent chats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Recent bot questions */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">최근 봇 질문</h3>
              <Link href="/ai?tab=bot" className="text-sm text-primary hover:underline">더 보기</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {botQuestions.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  아직 질문이 없습니다.{' '}
                  <Link href="/ai?tab=bot" className="text-primary hover:underline">질문하기</Link>
                </div>
              ) : (
                botQuestions.map((q) => {
                  const { text, cls } = statusLabel(q.status)
                  return (
                    <Link key={q.id} href="/ai?tab=bot" className="block px-6 py-3.5 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-gray-900 line-clamp-2 flex-1">{q.question}</p>
                        <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{text}</span>
                      </div>
                      {q.answer && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-1">{q.answer}</p>
                      )}
                    </Link>
                  )
                })
              )}
            </div>
          </Card>

          {/* Recent chats */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">최근 AI 채팅</h3>
              <Link href="/ai?tab=chat" className="text-sm text-primary hover:underline">더 보기</Link>
            </div>
            <div className="divide-y divide-gray-50">
              {chatSessions.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  아직 대화가 없습니다.{' '}
                  <Link href="/ai?tab=chat" className="text-primary hover:underline">AI에게 질문하기</Link>
                </div>
              ) : (
                chatSessions.map((session) => (
                  <Link key={session.id} href={`/chat/${session.id}`} className="block px-6 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{session.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          메시지 {session.message_count}개 · {
                            session.last_message_at
                              ? new Date(session.last_message_at).toLocaleDateString('ko-KR')
                              : new Date(session.created_at).toLocaleDateString('ko-KR')
                          }
                        </p>
                      </div>
                      <MessageSquare size={16} className="text-gray-300 shrink-0" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>
        </div>

      </div>
    </div>
  )
}
