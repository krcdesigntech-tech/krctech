/**
 * High-level resolver that joins `legal_references` → cache → law.go.kr API.
 *
 * Responsibilities:
 *   - Given a `legal_references` row, return its latest body (article or whole law)
 *     with PDF-vs-current diff information.
 *   - Cache-first: serve from `law_api_cache` when fresh, otherwise call the
 *     OPEN API and write back.
 *   - Compute the `amended_after_pdf` flag (effective_date > PDF cutoff).
 */

import { readCache, writeCache } from './cache'
import { getAdminRule, getLaw, searchLaw } from './open-law-client'
import { lawNamesEquivalent } from './name-canonicalizer'
import type {
  AdminRulePayload,
  LawPayload,
  LegalReference,
  LegalReferenceLatest,
} from '@/types/law.types'

/** PDF의 최신화 시점. 이후 시행된 개정은 ⚠ 배지로 표시한다. */
export const PDF_REFERENCE_DATE = '2026-02-02'

export interface ResolveOptions {
  /** Force a fresh API call even if cached. */
  force?: boolean
}

export async function resolveReferenceLatest(
  ref: LegalReference,
  opts: ResolveOptions = {}
): Promise<LegalReferenceLatest> {
  if (ref.api_target === 'external') {
    return {
      reference: ref,
      payload: null,
      cache: null,
      amended_after_pdf: false,
    }
  }

  // Resolve to a usable external_id (law_id / mst / admrul id).
  const externalId = await ensureExternalId(ref)
  if (!externalId) {
    return {
      reference: ref,
      payload: null,
      cache: null,
      amended_after_pdf: false,
    }
  }

  const cacheKey = {
    api_target: ref.api_target as 'law' | 'eflaw' | 'admrul',
    external_id: externalId,
    article_ref: ref.article_ref ?? null,
  }

  if (!opts.force) {
    const { row, stale } = await readCache(cacheKey)
    if (row && !stale) {
      return {
        reference: ref,
        payload: row.payload as LawPayload | AdminRulePayload,
        cache: {
          fetched_at: row.fetched_at,
          expires_at: row.expires_at,
          stale: false,
        },
        amended_after_pdf: isAmendedAfterPdf(row.effective_date),
      }
    }
  }

  // Fetch fresh.
  let payload: LawPayload | AdminRulePayload
  let effectiveDate: string | null = null
  let promulgationDate: string | null = null
  let revisionType: string | null = null

  if (ref.api_target === 'admrul') {
    const ruleRes = await getAdminRule(externalId)
    payload = ruleRes
    effectiveDate = ruleRes.enforcement_date
    promulgationDate = ruleRes.promulgation_date
  } else {
    const lawRes = await getLaw({
      lawId: looksLikeLawId(externalId) ? externalId : undefined,
      mst: looksLikeLawId(externalId) ? undefined : externalId,
      articleRef: ref.article_ref ?? undefined,
    })
    payload = lawRes
    effectiveDate = lawRes.law.enforcement_date
    promulgationDate = lawRes.law.promulgation_date
    revisionType = lawRes.law.revision_type
  }

  const cacheRow = await writeCache({
    ...cacheKey,
    payload,
    effective_date: effectiveDate,
    promulgation_date: promulgationDate,
    revision_type: revisionType,
  })

  return {
    reference: ref,
    payload,
    cache: {
      fetched_at: cacheRow.fetched_at,
      expires_at: cacheRow.expires_at,
      stale: false,
    },
    amended_after_pdf: isAmendedAfterPdf(effectiveDate),
  }
}

/**
 * If a reference doesn't yet have a law_id/mst, try a one-shot lawSearch
 * lookup to fill it in. Returns the external id usable in the API.
 */
async function ensureExternalId(ref: LegalReference): Promise<string | null> {
  if (ref.law_id) return ref.law_id
  if (ref.mst) return ref.mst

  if (ref.api_target === 'admrul') return null // admrul ids must be provided by admin

  const query = ref.canonical_law_name ?? ref.law_name
  if (!query) return null
  const hits = await searchLaw(query, { display: 5 })
  if (!hits.length) return null
  // Prefer exact name match, fall back to first hit.
  const exact = hits.find((h) => lawNamesEquivalent(h.name, query))
  return (exact ?? hits[0]).law_id || (exact ?? hits[0]).mst || null
}

function looksLikeLawId(value: string): boolean {
  // 법령ID is alphanumeric (often "001234"-style); MST is purely numeric.
  // The API accepts either via ID/MST, so this heuristic is just a hint.
  return !/^\d+$/.test(value)
}

function isAmendedAfterPdf(effectiveDate: string | null): boolean {
  if (!effectiveDate) return false
  return effectiveDate > PDF_REFERENCE_DATE
}
