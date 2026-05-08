'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ChevronDown, ChevronRight, ExternalLink, RefreshCw, AlertTriangle } from 'lucide-react'
import type {
  AdminRulePayload,
  LegalReference,
  LegalReferenceLatest,
} from '@/types/law.types'

interface Props {
  reference: LegalReference
}

const TARGET_LABEL: Record<LegalReference['api_target'], { label: string; variant: 'primary' | 'info' | 'warning' | 'default' }> = {
  law: { label: '법률·령·규칙', variant: 'primary' },
  eflaw: { label: '시행일 기준', variant: 'info' },
  admrul: { label: '행정규칙', variant: 'warning' },
  external: { label: '외부 자료', variant: 'default' },
}

export function ReferenceCard({ reference }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState<LegalReferenceLatest | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(force = false) {
    setLoading(true)
    setError(null)
    try {
      const url = force
        ? `/api/legal/references/${reference.id}/refresh`
        : `/api/legal/references/${reference.id}/latest`
      const res = await fetch(url, { method: force ? 'POST' : 'GET' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패')
      setData(json as LegalReferenceLatest)
    } catch (e) {
      setError(e instanceof Error ? e.message : '오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  function toggle() {
    const next = !expanded
    setExpanded(next)
    if (next && !data && !loading) load(false)
  }

  const targetMeta = TARGET_LABEL[reference.api_target]
  const lawSummary = data?.payload && 'law' in data.payload ? data.payload.law : null
  const articles = data?.payload && 'articles' in data.payload ? data.payload.articles : []
  const adminRule = data?.payload && 'rule_id' in data.payload ? (data.payload as AdminRulePayload) : null
  const headerName = lawSummary?.name ?? adminRule?.name ?? reference.canonical_law_name ?? reference.law_name
  const detailLink = lawSummary?.detail_link ?? adminRule?.detail_link
  const ministry = lawSummary?.ministry ?? adminRule?.ministry ?? reference.ministry
  const enforcementDate = lawSummary?.enforcement_date ?? adminRule?.enforcement_date

  return (
    <Card padding="md">
      <button
        onClick={toggle}
        className="w-full text-left flex items-start justify-between gap-3"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant={targetMeta.variant} size="sm">
              {targetMeta.label}
            </Badge>
            {data?.amended_after_pdf && (
              <Badge variant="warning" size="sm">
                <AlertTriangle size={12} className="mr-1" />
                PDF 작성 이후 개정
              </Badge>
            )}
            {reference.confidence < 0.7 && (
              <Badge variant="default" size="sm">
                매핑 검증 필요
              </Badge>
            )}
          </div>
          <p className="font-semibold text-gray-900 mt-1.5 truncate">{headerName}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 flex-wrap">
            {reference.article_ref && (
              <span className="font-mono text-primary">{reference.article_ref}</span>
            )}
            {ministry && <span>· {ministry}</span>}
            {enforcementDate && <span>· 시행 {enforcementDate}</span>}
          </div>
        </div>
        <div className="text-gray-400 mt-1">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </div>
      </button>

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Spinner size="sm" /> 법제처에서 본문을 불러오는 중...
            </div>
          )}
          {error && (
            <div className="text-sm text-status-error bg-status-error-light rounded-btn p-3">
              {error}
            </div>
          )}
          {data && !loading && (
            <>
              {reference.api_target === 'external' && (
                <p className="text-sm text-gray-500">
                  이 자료는 법제처 OPEN API로 조회할 수 없는 외부 지침/요령입니다.
                </p>
              )}
              {lawSummary && articles.length > 0 && (
                <div className="space-y-3">
                  {articles.map((a) => (
                    <div key={a.article_ref} className="text-sm">
                      <p className="font-semibold text-gray-900">
                        {a.article_ref} {a.title && <span className="text-gray-500">({a.title})</span>}
                      </p>
                      <p className="text-gray-700 mt-1 whitespace-pre-line leading-relaxed">
                        {a.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {lawSummary && articles.length === 0 && (
                <p className="text-sm text-gray-500">
                  본문 데이터를 가져왔지만 표시할 조문이 없습니다. (요청한 조문이 존재하지 않을 수 있음)
                </p>
              )}
              {adminRule && (
                <div className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                  {adminRule.body || '본문이 비어 있습니다.'}
                </div>
              )}

              <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-3">
                  {data.cache?.fetched_at && (
                    <span>
                      마지막 조회 {new Date(data.cache.fetched_at).toLocaleString('ko-KR')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {detailLink && (
                    <a
                      href={detailLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary font-medium"
                    >
                      <ExternalLink size={12} /> law.go.kr 원문
                    </a>
                  )}
                  <button
                    onClick={() => load(true)}
                    disabled={loading}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-btn border border-gray-200 hover:bg-gray-50 transition-colors"
                  >
                    <RefreshCw size={12} /> 최신 법령 확인
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
