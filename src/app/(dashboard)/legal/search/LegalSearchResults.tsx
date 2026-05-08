'use client'

import useSWR from 'swr'
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { ExternalLink } from 'lucide-react'
import type { LawSummary } from '@/types/law.types'

interface SearchResponse {
  query: string
  topics: Array<{ id: string; category: string; title: string; pdf_page: number | null }>
  references: Array<{
    id: string
    topic_id: string
    law_name: string
    canonical_law_name: string | null
    article_ref: string | null
  }>
  remote: LawSummary[]
  remote_error?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function LegalSearchResults({ query }: { query: string }) {
  const { data, error, isLoading } = useSWR<SearchResponse>(
    `/api/legal/search?query=${encodeURIComponent(query)}`,
    fetcher
  )

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-gray-500 text-sm">
        <Spinner size="sm" /> 검색 중...
      </div>
    )
  }
  if (error) return <p className="text-sm text-status-error">검색 중 오류가 발생했습니다.</p>
  if (!data) return null

  const { topics, references, remote, remote_error } = data

  return (
    <div className="space-y-8">
      {topics.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">
            업무 항목 매칭{' '}
            <span className="text-xs font-medium text-gray-400">{topics.length}건</span>
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {topics.map((t) => (
              <Link key={t.id} href={`/legal/${t.id}`}>
                <Card hover padding="md">
                  <Badge variant="primary" size="sm">
                    {t.category}
                  </Badge>
                  <p className="font-semibold text-gray-900 mt-2">{t.title}</p>
                  {t.pdf_page != null && (
                    <p className="text-xs text-gray-400 mt-1">PDF {t.pdf_page}쪽</p>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      {references.length > 0 && (
        <section>
          <h3 className="text-sm font-bold text-gray-700 mb-2">
            등록된 법령 참조{' '}
            <span className="text-xs font-medium text-gray-400">{references.length}건</span>
          </h3>
          <div className="space-y-2">
            {references.map((r) => (
              <Link key={r.id} href={`/legal/${r.topic_id}`}>
                <Card hover padding="sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {r.canonical_law_name ?? r.law_name}
                      </p>
                      {r.article_ref && (
                        <p className="text-xs text-primary font-mono">{r.article_ref}</p>
                      )}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="text-sm font-bold text-gray-700 mb-2">
          법제처 실시간 검색{' '}
          <span className="text-xs font-medium text-gray-400">{remote.length}건</span>
        </h3>
        {remote_error && (
          <p className="text-xs text-status-error">법제처 API 오류: {remote_error}</p>
        )}
        {remote.length === 0 && !remote_error && (
          <p className="text-sm text-gray-500">검색된 법령이 없습니다.</p>
        )}
        <div className="space-y-2">
          {remote.map((law) => (
            <Card key={`${law.law_id}-${law.mst}`} padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{law.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {law.ministry && <span>{law.ministry}</span>}
                    {law.enforcement_date && <span> · 시행 {law.enforcement_date}</span>}
                    {law.revision_type && <span> · {law.revision_type}</span>}
                  </p>
                </div>
                {law.detail_link && (
                  <a
                    href={law.detail_link}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary font-medium"
                  >
                    <ExternalLink size={12} /> 원문
                  </a>
                )}
              </div>
            </Card>
          ))}
        </div>
      </section>

      {topics.length === 0 && references.length === 0 && remote.length === 0 && !remote_error && (
        <p className="text-sm text-gray-500">검색 결과가 없습니다.</p>
      )}
    </div>
  )
}
