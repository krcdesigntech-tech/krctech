import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/law/auth'
import { createServiceClient } from '@/lib/supabase/server'
import { resolveReferenceLatest } from '@/lib/law/resolver'
import { purgeExpired } from '@/lib/law/cache'
import type { LegalReference } from '@/types/law.types'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/legal/admin/refresh-all
 *
 * Iterates every `legal_references` row with a resolvable api_target
 * (law/eflaw/admrul) and forces a fresh fetch + cache write. Used both
 * by the admin "전체 갱신" button and the daily Vercel Cron job.
 *
 * Vercel Cron auth: when called from cron, requests carry the
 * `x-vercel-cron` header — we accept those without admin login.
 */
export async function POST(request: Request) {
  const cronHeader = request.headers.get('x-vercel-cron')
  if (!cronHeader) {
    const admin = await requireAdmin()
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createServiceClient()
  const { data: refs, error } = await supabase
    .from('legal_references')
    .select('*')
    .neq('api_target', 'external')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const stats = { total: refs?.length ?? 0, refreshed: 0, failed: 0, errors: [] as string[] }

  for (const ref of refs ?? []) {
    try {
      await resolveReferenceLatest(ref as LegalReference, { force: true })
      stats.refreshed++
    } catch (e) {
      stats.failed++
      const msg = e instanceof Error ? e.message : String(e)
      stats.errors.push(`${(ref as LegalReference).law_name} (${(ref as LegalReference).id}): ${msg}`)
    }
  }

  const purged = await purgeExpired().catch(() => 0)

  return NextResponse.json({ ok: true, stats, expired_purged: purged })
}

export const GET = POST
