/**
 * 법제처 국가법령정보 OPEN API client (server-side only).
 *
 * Auth: requires `LAW_OPEN_API_OC` env var (the email-id portion of the
 * registered account on https://open.law.go.kr).
 *
 * Endpoints used:
 *   - GET /DRF/lawSearch.do  target=law       → law search
 *   - GET /DRF/lawService.do target=law       → current law body
 *   - GET /DRF/lawService.do target=eflaw     → law body at a specific
 *                                                effective date
 *   - GET /DRF/lawService.do target=admrul    → administrative rule body
 *
 * Response format: JSON. The API wraps payloads in a top-level container
 * keyed by the resource type (e.g. `LawSearch`, `법령`, `행정규칙`),
 * which we normalize via the `parser` helpers below.
 */

import { articleRefToJo, parseArticleRef } from './article-code'
import type { AdminRulePayload, LawArticle, LawPayload, LawSummary } from '@/types/law.types'

const BASE = 'https://open.law.go.kr/DRF'

function getOC(): string {
  const oc = process.env.LAW_OPEN_API_OC
  if (!oc) throw new Error('LAW_OPEN_API_OC env var is not set')
  return oc
}

interface FetchOpts {
  signal?: AbortSignal
}

async function callJson<T>(
  endpoint: 'lawSearch.do' | 'lawService.do',
  params: Record<string, string | number | undefined>,
  opts: FetchOpts = {}
): Promise<T> {
  const url = new URL(`${BASE}/${endpoint}`)
  url.searchParams.set('OC', getOC())
  url.searchParams.set('type', 'JSON')
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: opts.signal,
  })
  if (!res.ok) {
    throw new Error(`law.go.kr ${endpoint} failed: HTTP ${res.status}`)
  }
  // The API occasionally returns text/html error bodies even with type=JSON.
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(
      `law.go.kr ${endpoint} returned non-JSON (likely auth/quota error): ${text.slice(0, 200)}`
    )
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Search
// ─────────────────────────────────────────────────────────────────────────────

interface RawLawSearchHit {
  법령ID?: string
  법령일련번호?: string
  법령명한글?: string
  법령약칭명?: string
  공포일자?: string
  시행일자?: string
  소관부처명?: string
  제개정구분명?: string
  법령상세링크?: string
}

export interface SearchLawOptions {
  /** Number of rows per page (max 100, default 20). */
  display?: number
  /** Page index (1-based, default 1). */
  page?: number
}

export async function searchLaw(
  query: string,
  opts: SearchLawOptions = {}
): Promise<LawSummary[]> {
  const data = await callJson<{ LawSearch?: { law?: RawLawSearchHit[] | RawLawSearchHit } }>(
    'lawSearch.do',
    {
      target: 'law',
      query,
      display: opts.display ?? 20,
      page: opts.page ?? 1,
    }
  )
  const hits = data.LawSearch?.law
  if (!hits) return []
  const arr = Array.isArray(hits) ? hits : [hits]
  return arr.map(normalizeSearchHit)
}

function normalizeSearchHit(raw: RawLawSearchHit): LawSummary {
  return {
    law_id: raw.법령ID ?? '',
    mst: raw.법령일련번호 ?? '',
    name: raw.법령명한글 ?? '',
    short_name: raw.법령약칭명 ?? null,
    promulgation_date: parseDate(raw.공포일자),
    enforcement_date: parseDate(raw.시행일자),
    ministry: raw.소관부처명 ?? null,
    revision_type: raw.제개정구분명 ?? null,
    detail_link: raw.법령상세링크
      ? `https://www.law.go.kr${raw.법령상세링크.startsWith('/') ? '' : '/'}${raw.법령상세링크}`
      : undefined,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Law detail (current / by effective date)
// ─────────────────────────────────────────────────────────────────────────────

interface RawArticleNode {
  조문번호?: string
  조문가지번호?: string
  조문제목?: string
  조문내용?: string | string[]
  항?: Array<{ 항번호?: string; 항내용?: string | string[] }> | { 항번호?: string; 항내용?: string }
}

interface RawLawDetail {
  법령?: {
    기본정보?: {
      법령ID?: string
      법령일련번호?: string
      법령명_한글?: string
      법령명한글?: string
      약칭명?: string
      공포일자?: string
      시행일자?: string
      소관부처?: { content?: string } | string
      제개정구분?: string
    }
    조문?: { 조문단위?: RawArticleNode[] | RawArticleNode } | RawArticleNode[]
  }
}

export interface GetLawOptions {
  /** Either 법령ID or 법령일련번호 (MST). */
  lawId?: string
  mst?: string
  /** Single article (e.g. "제9조") to fetch via the JO param. */
  articleRef?: string
  /** When set, returns the law body in force on this date (YYYYMMDD). */
  effectiveDate?: string
}

export async function getLaw(opts: GetLawOptions): Promise<LawPayload> {
  if (!opts.lawId && !opts.mst) {
    throw new Error('getLaw requires lawId or mst')
  }
  const target = opts.effectiveDate ? 'eflaw' : 'law'
  const params: Record<string, string | number | undefined> = {
    target,
    ID: opts.lawId,
    MST: opts.mst,
  }
  if (opts.effectiveDate) params.efYd = opts.effectiveDate
  if (opts.articleRef) {
    const jo = articleRefToJo(opts.articleRef)
    if (jo) params.JO = jo
  }
  const raw = await callJson<RawLawDetail>('lawService.do', params)
  return normalizeLawDetail(raw, opts.articleRef ?? null)
}

function normalizeLawDetail(raw: RawLawDetail, requestedRef: string | null): LawPayload {
  const base = raw.법령?.기본정보 ?? {}
  const ministry = typeof base.소관부처 === 'string' ? base.소관부처 : base.소관부처?.content ?? null

  const summary: LawSummary = {
    law_id: base.법령ID ?? '',
    mst: base.법령일련번호 ?? '',
    name: base.법령명_한글 ?? base.법령명한글 ?? '',
    short_name: base.약칭명 ?? null,
    promulgation_date: parseDate(base.공포일자),
    enforcement_date: parseDate(base.시행일자),
    ministry,
    revision_type: base.제개정구분 ?? null,
  }

  const rawArticles = extractArticles(raw.법령?.조문)
  const articles = rawArticles.map(normalizeArticle).filter((a): a is LawArticle => Boolean(a))

  // If a specific article was requested but the API returned the whole law,
  // narrow to the requested article so callers can rely on the result shape.
  const filtered = requestedRef
    ? articles.filter((a) => articleMatchesRef(a.article_ref, requestedRef))
    : articles

  return {
    law: summary,
    articles: filtered.length ? filtered : articles,
    raw,
  }
}

function extractArticles(node: unknown): RawArticleNode[] {
  if (!node) return []
  if (Array.isArray(node)) return node as RawArticleNode[]
  const wrapped = (node as { 조문단위?: RawArticleNode[] | RawArticleNode }).조문단위
  if (!wrapped) return []
  return Array.isArray(wrapped) ? wrapped : [wrapped]
}

function normalizeArticle(node: RawArticleNode): LawArticle | null {
  const articleNo = node.조문번호?.trim() || null
  if (!articleNo) return null
  const branch = node.조문가지번호?.trim()
  const ref = branch && branch !== '0' ? `제${articleNo}조의${branch}` : `제${articleNo}조`
  const title = node.조문제목?.trim() || null

  const headBody = Array.isArray(node.조문내용)
    ? node.조문내용.join('\n')
    : node.조문내용 ?? ''

  const paragraphs: string[] = []
  if (node.항) {
    const items = Array.isArray(node.항) ? node.항 : [node.항]
    for (const item of items) {
      const body = Array.isArray(item.항내용) ? item.항내용.join('\n') : item.항내용
      if (body && body.trim()) paragraphs.push(body.trim())
    }
  }

  const content = [headBody.trim(), ...paragraphs].filter(Boolean).join('\n')

  return {
    article_ref: ref,
    article_no: articleNo,
    title,
    content,
  }
}

function articleMatchesRef(candidate: string, requested: string): boolean {
  const a = parseArticleRef(candidate)
  const b = parseArticleRef(requested)
  if (!a || !b) return false
  return a.article === b.article && a.branch === b.branch
}

// ─────────────────────────────────────────────────────────────────────────────
// Administrative rules (행정규칙)
// ─────────────────────────────────────────────────────────────────────────────

interface RawAdminRuleDetail {
  행정규칙?: {
    행정규칙ID?: string
    행정규칙명?: string
    공포일자?: string
    시행일자?: string
    소관부처명?: string
    상세링크?: string
    조문?: unknown
    본문?: unknown
  }
}

export async function getAdminRule(id: string): Promise<AdminRulePayload> {
  const raw = await callJson<RawAdminRuleDetail>('lawService.do', {
    target: 'admrul',
    ID: id,
  })
  const r = raw.행정규칙 ?? {}
  return {
    rule_id: r.행정규칙ID ?? id,
    name: r.행정규칙명 ?? '',
    promulgation_date: parseDate(r.공포일자),
    enforcement_date: parseDate(r.시행일자),
    ministry: r.소관부처명 ?? null,
    detail_link: r.상세링크
      ? `https://www.law.go.kr${r.상세링크.startsWith('/') ? '' : '/'}${r.상세링크}`
      : undefined,
    body: stringifyBody(r.조문 ?? r.본문 ?? ''),
    raw,
  }
}

function stringifyBody(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(stringifyBody).join('\n')
  if (value && typeof value === 'object') return JSON.stringify(value)
  return ''
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** law.go.kr returns dates as "YYYYMMDD" or "YYYY.MM.DD". Convert to ISO. */
function parseDate(input: string | undefined): string | null {
  if (!input) return null
  const digits = input.replace(/\D/g, '')
  if (digits.length !== 8) return null
  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
}
