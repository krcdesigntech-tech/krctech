export type LegalCategory =
  | '비용'
  | '계획'
  | '문화유산'
  | '환경'
  | '재해'
  | '개발'
  | '안전'
  | '군사'
  | '건축'
  | '해양'
  | '참고'

export type LawApiTarget = 'law' | 'eflaw' | 'admrul' | 'external'

export interface LegalTopic {
  id: string
  category: LegalCategory
  title: string
  pdf_page: number | null
  summary: string | null
  ord: number
  created_at: string
  updated_at: string
}

export interface LegalReference {
  id: string
  topic_id: string
  law_name: string
  canonical_law_name: string | null
  article_ref: string | null
  api_target: LawApiTarget
  law_id: string | null
  mst: string | null
  ministry: string | null
  confidence: number
  verified_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

export interface LawApiCacheRow {
  id: string
  api_target: Exclude<LawApiTarget, 'external'>
  external_id: string
  article_ref: string | null
  payload: LawPayload
  effective_date: string | null
  promulgation_date: string | null
  revision_type: string | null
  fetched_at: string
  expires_at: string
}

export interface LawSummary {
  law_id: string
  mst: string
  name: string
  short_name: string | null
  promulgation_date: string | null
  enforcement_date: string | null
  ministry: string | null
  revision_type: string | null
  detail_link?: string
}

export interface LawArticle {
  article_ref: string
  article_no: string | null
  title: string | null
  content: string
}

export interface LawPayload {
  law: LawSummary
  articles: LawArticle[]
  /** Pending revisions whose enforcement date is still in the future. */
  pending_revisions?: Array<{
    enforcement_date: string
    revision_type: string | null
  }>
  /** Original raw response, kept for debugging / future re-parsing. */
  raw?: unknown
}

export interface AdminRulePayload {
  rule_id: string
  name: string
  promulgation_date: string | null
  enforcement_date: string | null
  ministry: string | null
  detail_link?: string
  body: string
  raw?: unknown
}

/** Result returned from /api/legal/references/[id]/latest */
export interface LegalReferenceLatest {
  reference: LegalReference
  payload: LawPayload | AdminRulePayload | null
  cache: {
    fetched_at: string
    expires_at: string
    stale: boolean
  } | null
  /** True if the law's effective_date is after the PDF reference cutoff. */
  amended_after_pdf: boolean
}
