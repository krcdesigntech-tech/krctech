import { NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') return null
  return user
}

export async function GET() {
  const user = await requireAdmin()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const serviceClient = await createServiceClient()

  // Daily stats for the last 30 days
  const since = new Date()
  since.setDate(since.getDate() - 30)
  const sinceISO = since.toISOString()

  // Fetch raw activity logs in the window
  const { data: logs } = await serviceClient
    .from('activity_logs')
    .select('action, created_at')
    .gte('created_at', sinceISO)
    .order('created_at', { ascending: true })

  // Aggregate by date and action
  const daily: Record<string, { date: string; logins: number; views: number; chats: number; uploads: number }> = {}

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

  // Summary counts
  const { count: totalUsers } = await serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })

  const { count: totalDocuments } = await serviceClient
    .from('documents')
    .select('*', { count: 'exact', head: true })

  const { count: totalChats } = await serviceClient
    .from('chat_sessions')
    .select('*', { count: 'exact', head: true })

  // New users in last 30 days
  const { count: newUsers } = await serviceClient
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sinceISO)

  return NextResponse.json({
    daily: Object.values(daily),
    summary: {
      totalUsers: totalUsers ?? 0,
      totalDocuments: totalDocuments ?? 0,
      totalChats: totalChats ?? 0,
      newUsers: newUsers ?? 0,
    },
  })
}
