export const dynamic = 'force-dynamic'

import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Scale, FileText, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { LegalSearchBox } from './LegalSearchBox'
import { LawQAPanel } from '@/components/ai/LawQAPanel'
import type { LegalCategory } from '@/types/law.types'

const CATEGORY_ORDER: LegalCategory[] = [
  '비용',
  '계획',
  '문화유산',
  '환경',
  '재해',
  '개발',
  '안전',
  '군사',
  '건축',
  '해양',
  '참고',
]

const CATEGORY_LABEL: Record<LegalCategory, string> = {
  비용: '비용 관련',
  계획: '계획',
  문화유산: '문화유산',
  환경: '환경',
  재해: '재해',
  개발: '개발',
  안전: '안전',
  군사: '군사',
  건축: '건축',
  해양: '해양',
  참고: '참고사항',
}

interface TopicRow {
  id: string
  category: LegalCategory
  title: string
  pdf_page: number | null
  summary: string | null
  ord: number
}

export default async function LegalIndexPage() {
  const supabase = await createClient()

  const { data: topics } = await supabase
    .from('legal_topics')
    .select('id, category, title, pdf_page, summary, ord')
    .order('ord', { ascending: true })

  const { data: refs } = await supabase
    .from('legal_references')
    .select('topic_id')

  const refCount = (refs ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.topic_id as string] = (acc[r.topic_id as string] ?? 0) + 1
    return acc
  }, {})

  const grouped = new Map<LegalCategory, TopicRow[]>()
  for (const cat of CATEGORY_ORDER) grouped.set(cat, [])
  for (const t of (topics ?? []) as TopicRow[]) {
    if (grouped.has(t.category)) grouped.get(t.category)!.push(t)
  }

  const totalTopics = (topics ?? []).length
  const totalRefs = (refs ?? []).length

  return (
    <div>
      <Header title="법령AI" />
      <div className="max-w-container mx-auto px-6 py-6">
        <div className="mb-6">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Scale size={20} className="text-primary" />
            조사설계 관계법령 인덱스
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            질문을 입력하면 법령 코퍼스(법제처 조문)를 근거로 답변하고, 아래에서 업무 항목별
            법령 인덱스도 확인할 수 있습니다.
          </p>
        </div>

        {/* 법령 Q&A — 질문에 따라 근거 조문 기반 답변 */}
        <div className="mb-8">
          <LawQAPanel />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">업무 항목</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{totalTopics}</p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">연결된 법령 참조</p>
            <p className="text-2xl font-bold text-primary mt-1">{totalRefs}</p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">카테고리</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{CATEGORY_ORDER.length}</p>
          </Card>
          <Card padding="md">
            <p className="text-xs text-gray-500 font-medium">데이터 소스</p>
            <p className="text-sm font-bold text-gray-900 mt-2">법제처 OPEN API</p>
          </Card>
        </div>

        <div className="mb-8">
          <LegalSearchBox />
        </div>

        {totalTopics === 0 && (
          <Card padding="lg" className="text-center">
            <FileText size={32} className="mx-auto text-gray-300 mb-2" />
            <p className="text-gray-700 font-medium">아직 등록된 항목이 없습니다.</p>
            <p className="text-sm text-gray-500 mt-1">
              관리자 페이지에서 PDF를 업로드해 항목과 법령 참조를 동기화해 주세요.
            </p>
          </Card>
        )}

        {CATEGORY_ORDER.map((cat) => {
          const list = grouped.get(cat) ?? []
          if (!list.length) return null
          return (
            <section key={cat} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-base font-bold text-gray-900">
                  {CATEGORY_LABEL[cat]}
                  <span className="ml-2 text-xs font-medium text-gray-400">
                    {list.length}개 항목
                  </span>
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {list.map((t) => (
                  <Link key={t.id} href={`/legal/${t.id}`}>
                    <Card hover padding="md" className="h-full">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-gray-900 line-clamp-2">{t.title}</p>
                          {t.pdf_page != null && (
                            <p className="text-xs text-gray-400 mt-1">PDF {t.pdf_page}쪽</p>
                          )}
                        </div>
                        <Badge variant="primary" size="sm">
                          법령 {refCount[t.id] ?? 0}
                        </Badge>
                      </div>
                      {t.summary && (
                        <p className="text-xs text-gray-500 mt-3 line-clamp-3">{t.summary}</p>
                      )}
                      <div className="mt-3 flex items-center text-xs font-medium text-primary">
                        상세 보기 <ArrowRight size={12} className="ml-1" />
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
