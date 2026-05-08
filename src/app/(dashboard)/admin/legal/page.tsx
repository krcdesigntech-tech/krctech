export const dynamic = 'force-dynamic'

import { Header } from '@/components/layout/Header'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { LegalAdminPanel } from './LegalAdminPanel'
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
  const [{ data: topics }, { data: references }, { data: cacheStats }] = await Promise.all([
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
  ])

  const lastSync = cacheStats?.[0]?.fetched_at as string | undefined
  const totalRefs = references?.length ?? 0
  const verified = (references ?? []).filter((r) => r.verified_at).length
  const lowConfidence = (references ?? []).filter((r) => r.confidence < 0.7 && !r.verified_at).length

  return (
    <div>
      <Header title="법령 매핑 검증" />
      <div className="max-w-container mx-auto px-6 py-6">
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
