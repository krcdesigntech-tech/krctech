/**
 * Cache layer for law.go.kr OPEN API responses.
 *
 * Strategy:
 *   - Use a Supabase service-role client so we can write cache rows from
 *     read paths (the row-level policy only allows authenticated reads).
 *   - Default TTL is 24 hours. If the law has a *pending* revision whose
 *     enforcement date is sooner than 24h away, shorten TTL to that date.
 *   - On read: return cache row if still valid. The caller decides whether
 *     to render `stale=true` rows while a background refresh runs.
 */

import { createServiceClient } from '@/lib/supabase/server'
import type { AdminRulePayload, LawApiCacheRow, LawPayload } from '@/types/law.types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface CacheKey {
  api_target: 'law' | 'eflaw' | 'admrul'
  external_id: string
  article_ref: string | null
}

export interface CacheReadResult {
  row: LawApiCacheRow | null
  stale: boolean
}

export async function readCache(key: CacheKey): Promise<CacheReadResult> {
  const supabase = await createServiceClient()
  let q = supabase
    .from('law_api_cache')
    .select('*')
    .eq('api_target', key.api_target)
    .eq('external_id', key.external_id)
  q = key.article_ref === null ? q.is('article_ref', null) : q.eq('article_ref', key.article_ref)

  const { data, error } = await q.maybeSingle()
  if (error) throw error
  if (!data) return { row: null, stale: false }

  const stale = new Date(data.expires_at).getTime() < Date.now()
  return { row: data as LawApiCacheRow, stale }
}

export interface WriteCacheInput extends CacheKey {
  payload: LawPayload | AdminRulePayload
  effective_date?: string | null
  promulgation_date?: string | null
  revision_type?: string | null
  /** When the next revision is in force (ISO date). Used to shorten TTL. */
  next_revision_date?: string | null
}

export async function writeCache(input: WriteCacheInput): Promise<LawApiCacheRow> {
  const supabase = await createServiceClient()
  const expiresAt = computeExpiresAt(input.next_revision_date ?? null)

  const { data, error } = await supabase
    .from('law_api_cache')
    .upsert(
      {
        api_target: input.api_target,
        external_id: input.external_id,
        article_ref: input.article_ref,
        payload: input.payload,
        effective_date: input.effective_date ?? null,
        promulgation_date: input.promulgation_date ?? null,
        revision_type: input.revision_type ?? null,
        fetched_at: new Date().toISOString(),
        expires_at: expiresAt,
      },
      { onConflict: 'api_target,external_id,article_ref' }
    )
    .select('*')
    .single()

  if (error) throw error
  return data as LawApiCacheRow
}

function computeExpiresAt(nextRevisionDate: string | null): string {
  const default_ = new Date(Date.now() + DAY_MS)
  if (!nextRevisionDate) return default_.toISOString()

  const next = new Date(nextRevisionDate)
  if (Number.isNaN(next.getTime())) return default_.toISOString()
  return (next < default_ ? next : default_).toISOString()
}

export async function purgeExpired(): Promise<number> {
  const supabase = await createServiceClient()
  const { count, error } = await supabase
    .from('law_api_cache')
    .delete({ count: 'exact' })
    .lt('expires_at', new Date().toISOString())
  if (error) throw error
  return count ?? 0
}
