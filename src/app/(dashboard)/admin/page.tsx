export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Users, FileText, MessageSquare, TrendingUp, Eye, LogIn } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'

interface DailyRow {
  date: string
  logins: number
  views: number
  chats: number
  uploads: number
}

interface Summary {
  totalUsers: number
  totalDocuments: number
  totalChats: number
  newUsers: number
  totalViews: number
  totalLogins: number
}

async function getStats(): Promise<{ daily: DailyRow[]; summary: Summary }> {
  const serviceClient = await createServiceClient()

  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceISO = since.toISOString()

  const { data: logs } = await serviceClient
    .from('activity_logs')
    .select('action, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })

  const daily: Record<string, DailyRow> = {}
  for (let i = 29; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const key = d.toISOString().slice(0, 10)
    daily[key] = { date: key, logins: 0, views: 0, chats: 0, uploads: 0 }
  }
  for (const log of logs ?? []) {
    const key = (log.created_at as string).slice(0, 10)
    if (!daily[key]) continue
    if (log.action === 'login') daily[key].logins++
    else if (log.action === 'page_view') daily[key].views++
    else if (log.action === 'chat_message') daily[key].chats++
    else if (log.action === 'document_upload') daily[key].uploads++
  }

  const [{ count: totalUsers }, { count: totalDocuments }, { count: totalChats }, { count: newUsers }] =
    await Promise.all([
      serviceClient.from('profiles').select('*', { count: 'exact', head: true }),
      serviceClient.from('documents').select('*', { count: 'exact', head: true }),
      serviceClient.from('chat_sessions').select('*', { count: 'exact', head: true }),
      serviceClient.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', sinceISO),
    ])

  const dailyArr = Object.values(daily)

  return {
    daily: dailyArr,
    summary: {
      totalUsers: totalUsers ?? 0,
      totalDocuments: totalDocuments ?? 0,
      totalChats: totalChats ?? 0,
      newUsers: newUsers ?? 0,
      totalViews: dailyArr.reduce((s, d) => s + d.views, 0),
      totalLogins: dailyArr.reduce((s, d) => s + d.logins, 0),
    },
  }
}

export default async function AdminPage() {
  const { daily, summary } = await getStats()
  const recentDays = daily.slice(-14)

  const maxViews = Math.max(...recentDays.map((d) => d.views), 1)
  const maxLogins = Math.max(...recentDays.map((d) => d.logins), 1)

  return (
    <div className="p-8 max-w-[1160px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">관리자 패널</h1>
        <p className="text-sm text-gray-500 mt-1">서비스 현황 및 사용자 관리 (최근 30일)</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        <SummaryCard
          label="전체 사용자"
          value={summary.totalUsers}
          sub={`신규 ${summary.newUsers}명 (30일)`}
          icon={<Users size={20} className="text-primary" />}
        />
        <SummaryCard
          label="30일 페이지 조회수"
          value={summary.totalViews}
          sub="누적 페이지뷰"
          icon={<Eye size={20} className="text-primary" />}
        />
        <SummaryCard
          label="30일 로그인 수"
          value={summary.totalLogins}
          sub="누적 로그인"
          icon={<LogIn size={20} className="text-primary" />}
        />
        <SummaryCard
          label="전체 문서"
          value={summary.totalDocuments}
          sub="업로드 완료"
          icon={<FileText size={20} className="text-primary" />}
        />
        <SummaryCard
          label="전체 AI 대화"
          value={summary.totalChats}
          sub="채팅 세션"
          icon={<MessageSquare size={20} className="text-primary" />}
        />
        <SummaryCard
          label="30일 AI 질문"
          value={daily.reduce((s, d) => s + d.chats, 0)}
          sub="채팅 메시지"
          icon={<TrendingUp size={20} className="text-primary" />}
        />
      </div>

      {/* 페이지 조회수 차트 */}
      <div className="bg-white rounded-card border border-gray-200 p-6 mb-4">
        <h2 className="text-base font-semibold text-gray-900 mb-4">일별 페이지 조회수 (최근 14일)</h2>
        <BarChart days={recentDays} valueKey="views" max={maxViews} color="bg-primary" />
      </div>

      {/* 로그인 수 차트 */}
      <div className="bg-white rounded-card border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">일별 로그인 수 (최근 14일)</h2>
        <BarChart days={recentDays} valueKey="logins" max={maxLogins} color="bg-green-400" />
      </div>

      {/* 관리 메뉴 */}
      <div className="bg-white rounded-card border border-gray-200 p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">관리 메뉴</h2>
        <div className="flex gap-3 flex-wrap">
          <Link
            href="/admin/users"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-white text-sm font-medium rounded-btn hover:bg-primary/90 transition-colors"
          >
            <Users size={16} />
            사용자 관리
          </Link>
        </div>
      </div>
    </div>
  )
}

function BarChart({
  days,
  valueKey,
  max,
  color,
}: {
  days: DailyRow[]
  valueKey: 'views' | 'logins' | 'chats'
  max: number
  color: string
}) {
  return (
    <div className="flex items-end gap-1.5 h-32">
      {days.map((d) => {
        const val = d[valueKey]
        const height = max > 0 ? Math.round((val / max) * 100) : 0
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
            <span className="text-xs text-gray-500">{val > 0 ? val : ''}</span>
            <div
              className={`w-full ${color} rounded-sm transition-all`}
              style={{ height: `${Math.max(height, val > 0 ? 4 : 0)}%` }}
              title={`${d.date}: ${val}건`}
            />
            <span className="text-xs text-gray-400 truncate w-full text-center">
              {d.date.slice(5)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string
  value: number
  sub: string
  icon: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-card border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{label}</span>
        {icon}
      </div>
      <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>
      <p className="text-xs text-gray-400 mt-1">{sub}</p>
    </div>
  )
}
