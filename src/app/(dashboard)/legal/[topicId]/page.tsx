export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react'
import type { LegalReference, LegalTopic } from '@/types/law.types'
import { ReferenceCard } from './ReferenceCard'

export default async function LegalTopicDetailPage({
  params,
}: {
  params: Promise<{ topicId: string }>
}) {
  const { topicId } = await params
  const supabase = await createClient()

  const [{ data: topic }, { data: references }] = await Promise.all([
    supabase
      .from('legal_topics')
      .select('*')
      .eq('id', topicId)
      .maybeSingle(),
    supabase
      .from('legal_references')
      .select('*')
      .eq('topic_id', topicId)
      .order('confidence', { ascending: false }),
  ])

  if (!topic) notFound()

  const t = topic as LegalTopic
  const refs = (references ?? []) as LegalReference[]

  return (
    <div>
      <Header title={t.title} />
      <div className="max-w-container mx-auto px-6 py-6">
        <Link
          href="/legal"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-900 mb-4"
        >
          <ArrowLeft size={14} className="mr-1" /> 관계법령 인덱스
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* PDF summary */}
          <Card padding="lg" className="lg:col-span-1 h-fit">
            <div className="flex items-center justify-between mb-3">
              <Badge variant="primary">{t.category}</Badge>
              {t.pdf_page != null && (
                <span className="text-xs text-gray-400">PDF {t.pdf_page}쪽</span>
              )}
            </div>
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{t.title}</h2>
            <div className="mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                참고서 요약
              </p>
              {t.summary ? (
                <p className="text-sm text-gray-700 mt-2 whitespace-pre-line line-clamp-[20]">
                  {t.summary}
                </p>
              ) : (
                <p className="text-sm text-gray-400 mt-2">PDF에서 추출된 요약이 없습니다.</p>
              )}
            </div>
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                본 인덱스는 <code className="font-mono">2026.02</code> 참고서 기준이며, 법령
                본문은 법제처 OPEN API에서 실시간 조회합니다.
              </p>
            </div>
          </Card>

          {/* References */}
          <div className="lg:col-span-2 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-gray-900">
                연결 법령 / 조문
                <span className="ml-2 text-xs text-gray-400">{refs.length}건</span>
              </h3>
            </div>

            {refs.length === 0 ? (
              <Card padding="lg" className="text-center">
                <FileText size={28} className="mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-600">
                  아직 매핑된 법령 참조가 없습니다.
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  관리자가 동기화한 후 표시됩니다.
                </p>
              </Card>
            ) : (
              refs.map((ref) => <ReferenceCard key={ref.id} reference={ref} />)
            )}

            <div className="text-xs text-gray-400 pt-2 flex items-center gap-1">
              <ExternalLink size={12} />
              <span>모든 법령 본문은 국가법령정보센터(law.go.kr)와 동일한 데이터를 사용합니다.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
