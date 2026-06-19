export const dynamic = 'force-dynamic'

import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { LegalAdminPanel } from './LegalAdminPanel'
import { AgentProposalsPanel, type AgentProposal } from './AgentProposalsPanel'
import { Card } from '@/components/ui/Card'
import type { LegalReference, LegalTopic } from '@/types/law.types'

export default async function AdminLegalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (profile?.role !== 'admin') redirect('/dashboard')

  const service = await createServiceClient()
  const since30 = new Date(Date.now() - 30 * 86400000).toISOString()
  const [
    { data: topics },
    { data: references },
    { data: cacheStats },
    { data: proposals },
    { count: qaCount },
    { count: qaEmptyCount },
    { data: downFb },
  ] = await Promise.all([
    service.from('legal_topics').select('*').order('ord', { ascending: true }),
    service
      .from('legal_references')
      .select('*')
      .order('confidence', { ascending: true })
      .order('verified_at', { ascending: true, nullsFirst: true }),
    service
      .from('law_api_cache')
      .select('fetched_at, expires_at')
      .order('fetched_at', { ascending: false })
      .limit(1),
    service
      .from('agent_proposals')
      .select('id, kind, payload, rationale, risk_level, status, created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    service.from('qa_logs').select('*', { count: 'exact', head: true }).gte('created_at', since30),
    service.from('qa_logs').select('*', { count: 'exact', head: true }).gte('created_at', since30).eq('status', 'empty'),
    service.from('qa_feedback').select('rating').gte('created_at', since30).in('rating', ['down', 'insufficient']),
  ])

  const lastSync = cacheStats?.[0]?.fetched_at as string | undefined
  const totalRefs = references?.length ?? 0
  const verified = (references ?? []).filter((r) => r.verified_at).length
  const lowConfidence = (references ?? []).filter((r) => r.confidence < 0.7 && !r.verified_at).length
  const qaTotal = qaCount ?? 0
  const qaEmpty = qaEmptyCount ?? 0
  const negFb = (downFb ?? []).length

  return (
    <div>
      <Header title="법령 매핑 검증" />
      <div className="max-w-container mx-auto px-6 py-6">
        {/* Q&A 품질 (최근 30일) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">질문 수(30일)</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{qaTotal}</p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">0결과 비율</p>
            <p className="text-2xl font-bold text-status-warning mt-1">
              {qaTotal ? Math.round((qaEmpty / qaTotal) * 100) : 0}%
            </p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">부정 피드백(30일)</p>
            <p className="text-2xl font-bold text-status-error mt-1">{negFb}</p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">대기 제안</p>
            <p className="text-2xl font-bold text-primary mt-1">{(proposals ?? []).length}</p>
          </Card>
        </div>

        <AgentProposalsPanel initial={(proposals ?? []) as AgentProposal[]} />

        <LegalAdminPanel
          topics={(topics ?? []) as LegalTopic[]}
          references={(references ?? []) as LegalReference[]}
          stats={{
            totalRefs,
            verified,
            lowConfidence,
            lastSync: lastSync ?? null,
          }}
        />
      </div>
    </div>
  )
}
