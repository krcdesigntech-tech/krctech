export const dynamic = 'force-dynamic'

import { Header } from '@/components/layout/Header'
import { LegalSearchBox } from '../legal/LegalSearchBox'
import { LegalSearchResults } from '../legal/search/LegalSearchResults'

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  return (
    <div>
      <Header title="검색" />
      <div className="max-w-container mx-auto px-6 py-6">
        <div className="mb-6">
          <LegalSearchBox initialQuery={query} basePath="/search" />
        </div>
        {query && <LegalSearchResults query={query} />}
        {!query && (
          <p className="text-sm text-gray-500">
            법령명, 조문 번호, 업무 항목 키워드로 통합 검색합니다.
          </p>
        )}
      </div>
    </div>
  )
}
