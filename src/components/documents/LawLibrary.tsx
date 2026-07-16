'use client'

import { useMemo, useState } from 'react'
import useSWR from 'swr'
import { Scale, Search, BookOpen, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import { Spinner } from '@/components/ui/Spinner'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

interface LawListItem {
  id: string
  law_name: string
  canonical_law_name: string | null
  ministry: string | null
  effective_date: string | null
  source: string
}
interface Article {
  chunk_index: number
  article_no: string | null
  article_title: string | null
  content: string
  metadata: Record<string, unknown>
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 키워드를 <mark>로 강조. */
function highlight(text: string, term: string) {
  if (!term.trim()) return text
  const re = new RegExp(`(${escapeRegExp(term.trim())})`, 'gi')
  const parts = text.split(re)
  return parts.map((p, i) =>
    re.test(p) ? (
      <mark key={i} className="bg-amber-200/70 rounded px-0.5">
        {p}
      </mark>
    ) : (
      <span key={i}>{p}</span>
    )
  )
}

export function LawLibrary() {
  const { data, isLoading } = useSWR<{ laws: LawListItem[] }>('/api/legal/library', fetcher)
  const laws = useMemo(() => data?.laws ?? [], [data])

  const [listQuery, setListQuery] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [docQuery, setDocQuery] = useState('')

  const filteredLaws = useMemo(() => {
    const q = listQuery.trim()
    if (!q) return laws
    return laws.filter(
      (l) => l.law_name.includes(q) || (l.canonical_law_name ?? '').includes(q)
    )
  }, [laws, listQuery])

  const { data: detail, isLoading: detailLoading } = useSWR<{
    law: LawListItem & { detail_link?: string }
    articles: Article[]
  }>(selectedId ? `/api/legal/library/${selectedId}` : null, fetcher)

  const articles = useMemo(() => detail?.articles ?? [], [detail])
  const shownArticles = useMemo(() => {
    const q = docQuery.trim()
    if (!q) return articles
    return articles.filter(
      (a) => a.content.includes(q) || (a.article_no ?? '').includes(q) || (a.article_title ?? '').includes(q)
    )
  }, [articles, docQuery])

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
      {/* 법령 목록 */}
      <Card padding="none" className="h-[calc(100vh-220px)] flex flex-col">
        <div className="p-3 border-b border-gray-100">
          <div className="relative">
            <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="법령명 검색"
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-10"><Spinner /></div>
          ) : filteredLaws.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-10">
              {laws.length === 0 ? '적재된 법령이 없습니다.' : '검색 결과 없음'}
            </p>
          ) : (
            filteredLaws.map((l) => (
              <button
                key={l.id}
                onClick={() => { setSelectedId(l.id); setDocQuery('') }}
                className={`w-full text-left px-3.5 py-3 hover:bg-gray-50 transition-colors ${
                  selectedId === l.id ? 'bg-primary-light/50' : ''
                }`}
              >
                <p className="text-sm font-medium text-gray-900 line-clamp-2">{l.law_name}</p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {l.ministry || '소관부처 미상'}
                  {l.source === 'source_only' && ' · 전문 미확인'}
                </p>
              </button>
            ))
          )}
        </div>
        <div className="p-2 border-t border-gray-100 text-center text-xs text-gray-400">
          총 {laws.length}개 법령
        </div>
      </Card>

      {/* 조문 열람 */}
      <Card padding="none" className="h-[calc(100vh-220px)] flex flex-col">
        {!selectedId ? (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300">
            <Scale size={48} className="mb-3" />
            <p className="text-sm text-gray-400">왼쪽에서 법령을 선택하세요.</p>
          </div>
        ) : detailLoading ? (
          <div className="flex-1 flex justify-center items-center"><Spinner size="lg" /></div>
        ) : (
          <>
            <div className="p-4 border-b border-gray-100">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-gray-900">{detail?.law.law_name}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {detail?.law.ministry || '소관부처 미상'}
                    {detail?.law.effective_date && ` · 시행 ${detail.law.effective_date}`}
                    {` · 조문 ${articles.length}개`}
                  </p>
                </div>
                {detail?.law.detail_link && (
                  <a
                    href={detail.law.detail_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    법제처 원문 <ExternalLink size={12} />
                  </a>
                )}
              </div>
              <div className="relative mt-3">
                <BookOpen size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={docQuery}
                  onChange={(e) => setDocQuery(e.target.value)}
                  placeholder="이 법령 안에서 검색 (조문번호·키워드)"
                  className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-primary/30"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {shownArticles.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10">검색 결과가 없습니다.</p>
              ) : (
                shownArticles.map((a) => (
                  <div key={a.chunk_index} className="border-b border-gray-50 pb-4 last:border-0">
                    {(a.article_no || a.article_title) && (
                      <p className="text-sm font-semibold text-primary mb-1">
                        {highlight(`${a.article_no ?? ''} ${a.article_title ?? ''}`.trim(), docQuery)}
                        {a.metadata?.kind === 'appendix' && (
                          <span className="ml-2 text-xs font-normal text-gray-400">[별표/서식]</span>
                        )}
                      </p>
                    )}
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                      {highlight(a.content, docQuery)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
