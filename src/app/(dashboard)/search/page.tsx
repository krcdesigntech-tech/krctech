'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { Search, FileText } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { CategoryBadge } from '@/components/ui/Badge'
import type { MatchedChunk } from '@/types/database.types'

export default function SearchPage() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MatchedChunk[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return

    setLoading(true)
    setSearched(true)
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim() }),
      })
      const data = await res.json()
      setResults(data.results || [])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Header title="문서 검색" />
      <div className="max-w-3xl mx-auto px-6 py-6">
        <form onSubmit={handleSearch} className="flex gap-3 mb-6">
          <div className="flex-1">
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="예: 사도 개설 허가 기준, 설계하중 조합, 콘크리트 강도..."
              icon={<Search size={16} />}
            />
          </div>
          <Button type="submit" loading={loading} icon={<Search size={16} />}>
            검색
          </Button>
        </form>

        {searched && !loading && results.length === 0 && (
          <Card padding="lg" className="text-center py-12">
            <Search size={40} className="text-gray-200 mx-auto mb-3" />
            <p className="text-gray-500">관련 내용을 찾지 못했습니다.</p>
            <p className="text-sm text-gray-400 mt-1">다른 검색어로 시도해보세요.</p>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 font-medium">{results.length}건의 관련 내용을 찾았습니다.</p>
            {results.map((chunk, i) => (
              <Card key={i} padding="md">
                <div className="flex items-start gap-3 mb-3">
                  <FileText size={16} className="text-gray-400 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {chunk.document_name}
                      </span>
                      {chunk.page_number && (
                        <span className="text-xs text-gray-400">p.{chunk.page_number}</span>
                      )}
                      <CategoryBadge category={chunk.document_category} />
                      <span className="text-xs text-primary font-medium ml-auto">
                        유사도 {(chunk.similarity * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                </div>
                <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-6">
                  {chunk.content}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
