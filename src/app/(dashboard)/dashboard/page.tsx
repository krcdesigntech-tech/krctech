export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { FileText, MessageSquare, CheckCircle, Clock } from 'lucide-react'
import Link from 'next/link'
import { StatusBadge, CategoryBadge } from '@/components/ui/Badge'
import type { Document, ChatSession } from '@/types/database.types'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const [{ data: docs }, { data: sessions }, { data: profile }] = await Promise.all([
    supabase
      .from('documents')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('chat_sessions')
      .select('*')
      .eq('user_id', user!.id)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase.from('profiles').select('*').eq('id', user!.id).single(),
  ])

  const documents = (docs || []) as Document[]
  const chatSessions = (sessions || []) as ChatSession[]

  const readyCount = documents.filter((d) => d.status === 'ready').length
  const processingCount = documents.filter((d) =>
    d.status === 'processing' || d.status === 'uploading'
  ).length

  return (
    <div>
      <Header title="대시보드" />
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

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card padding="md">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">전체 문서</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{documents.length}</p>
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
                <p className="text-2xl font-bold text-status-success mt-1">{readyCount}</p>
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
                <p className="text-2xl font-bold text-status-warning mt-1">{processingCount}</p>
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
                <p className="text-2xl font-bold text-gray-900 mt-1">{chatSessions.length}</p>
              </div>
              <div className="w-9 h-9 bg-primary-light rounded-lg flex items-center justify-center">
                <MessageSquare size={18} className="text-primary" />
              </div>
            </div>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Documents */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">최근 문서</h3>
              <Link href="/documents" className="text-sm text-primary hover:underline">
                전체 보기
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {documents.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  업로드된 문서가 없습니다.{' '}
                  <Link href="/documents/upload" className="text-primary hover:underline">
                    문서 업로드하기
                  </Link>
                </div>
              ) : (
                documents.map((doc) => (
                  <Link key={doc.id} href={`/documents/${doc.id}`} className="block px-6 py-3.5 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{doc.original_name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CategoryBadge category={doc.category} />
                          <span className="text-xs text-gray-400">
                            {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                          </span>
                        </div>
                      </div>
                      <StatusBadge status={doc.status} />
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Card>

          {/* Recent Chats */}
          <Card padding="none">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">최근 AI 대화</h3>
              <Link href="/chat" className="text-sm text-primary hover:underline">
                전체 보기
              </Link>
            </div>
            <div className="divide-y divide-gray-50">
              {chatSessions.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-gray-400">
                  아직 대화가 없습니다.{' '}
                  <Link href="/chat" className="text-primary hover:underline">
                    AI에게 질문하기
                  </Link>
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
