export const dynamic = 'force-dynamic'

import Link from 'next/link'
import { Users, FileText, MessageSquare, TrendingUp } from 'lucide-react'
import { createServiceClient } from '@/lib/supabase/server'

interface DailyRow {
  date: string
  logins: number
  chats: number
  uploads: number
}

interface Summary {
  totalUsers: number
  totalDocuments: number
  totalChats: number
  newUsers: number
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
    daily[key] = { date: key, logins: 0, chats: 0, uploads: 0 }
  }
  for (const log of logs ?? []) {
    const key = (log.created_at as string).slice(0, 10)
    if (!daily[key]) continue
    if (log.action === 'login') daily[key].logins++
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

  return {
    daily: Object.values(daily),
    summary: {
      totalUsers: totalUsers ?? 0,
      totalDocuments: totalDocuments ?? 0,
      totalChats: totalChats ?? 0,
      newUsers: newUsers ?? 0,
    },
  }
}

export default async function AdminPage() {
  const { daily, summary } = await getStats()

  const maxLogins = Math.max(...daily.map((d) => d.logins), 1)
  const recentDays = daily.slice(-14) // last 14 days for chart

  return (
    <div className="p-8 max-w-[1160px]">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">관리자 패널</h1>
        <p className="text-sm text-gray-500 mt-1">서비스 현황 및 사용자 관리</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <SummaryCard
          label="전체 사용자"
          value={summary.totalUsers}
          sub={`신규 ${summary.newUsers}명 (30일)`}
          icon={<Users size={20} className="text-primary" />}
        />
        <SummaryCard
          label="전체 문서"
          value={summary.totalDocuments}
          sub="업로드 완료"
          icon={<FileText size={20} className="text-primary" />}
        />
        <SummaryCard
          label="전체 대화"
          value={summary.totalChats}
          sub="AI 채팅 세션"
          icon={<MessageSquare size={20} className="text-primary" />}
        />
        <SummaryCard
          label="최근 30일 로그인"
          value={daily.reduce((s, d) => s + d.logins, 0)}
          sub="누적 로그인 수"
          icon={<TrendingUp size={20} className="text-primary" />}
        />
      </div>

      {/* Daily login chart */}
      <div className="bg-white rounded-card border border-gray-200 p-6 mb-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">일별 로그인 수 (최근 14일)</h2>
        <div className="flex items-end gap-1.5 h-32">
          {recentDays.map((d) => {
            const height = maxLogins > 0 ? Math.round((d.logins / maxLogins) * 100) : 0
            return (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-xs text-gray-500">{d.logins}</span>
                <div
                  className="w-full bg-primary rounded-sm transition-all"
                  style={{ height: `${Math.max(height, d.logins > 0 ? 4 : 0)}%` }}
                  title={`${d.date}: ${d.logins}건`}
                />
                <span className="text-xs text-gray-400 rotate-0 truncate w-full text-center">
                  {d.date.slice(5)}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quick links */}
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
