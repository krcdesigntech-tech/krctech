export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { getCurrentUser, getCurrentProfile } from '@/lib/supabase/auth'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { FileText, MessageSquare, CheckCircle, Clock, Scale } from 'lucide-react'
import Link from 'next/link'
import type { ChatSession } from '@/types/database.types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const [user, profile] = await Promise.all([getCurrentUser(), getCurrentProfile()])

  const [
    { data: sessions },
    { count: totalDocs },
    { count: readyDocs },
    { count: processingDocs },
    { count: totalChats },
  ] = await Promise.all([
    supabase.from('chat_sessions').select('id, title, message_count, last_message_at, created_at, updated_at').eq('user_id', user!.id).order('updated_at', { ascending: false }).limit(3),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).eq('status', 'ready'),
    supabase.from('documents').select('*', { count: 'exact', head: true }).eq('user_id', user!.id).in('status', ['uploading', 'processing']),
    supabase.from('chat_sessions').select('*', { count: 'exact', head: true }).eq('user_id', user!.id),
  ])

  const chatSessions = (sessions || []) as ChatSession[]

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
            토목설계 문서를 업로드하고, 관계법령을 AI에게 질문해보세요.
          </p>
        </div>

        {/* Legal Q&A entry */}
        <Card padding="md" className="mb-6">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-light rounded-lg flex items-center justify-center shrink-0">
                <Scale size={20} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-900">법령 Q&amp;A</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  조사설계 관계법령·조문을 근거로 답변합니다.
                </p>
              </div>
            </div>
            <Link
              href="/legal"
              className="shrink-0 inline-flex items-center px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              질문하기
            </Link>
          </div>
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

        {/* Recent chats */}
        <Card padding="none">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">최근 AI 채팅</h3>
            <Link href="/legal" className="text-sm text-primary hover:underline">더 보기</Link>
          </div>
          <div className="divide-y divide-gray-50">
            {chatSessions.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                아직 대화가 없습니다.{' '}
                <Link href="/legal" className="text-primary hover:underline">AI에게 질문하기</Link>
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
  )
}
