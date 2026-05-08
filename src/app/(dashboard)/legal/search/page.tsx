export const dynamic = 'force-dynamic'

import { Header } from '@/components/layout/Header'
import { LegalSearchBox } from '../LegalSearchBox'
import { LegalSearchResults } from './LegalSearchResults'

export default async function LegalSearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const { q } = await searchParams
  const query = q?.trim() ?? ''

  return (
    <div>
      <Header title="법령 검색" />
      <div className="max-w-container mx-auto px-6 py-6">
        <div className="mb-6">
          <LegalSearchBox initialQuery={query} />
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
