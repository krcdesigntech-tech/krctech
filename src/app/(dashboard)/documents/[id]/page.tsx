export const dynamic = 'force-dynamic'

import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { StatusBadge, CategoryBadge } from '@/components/ui/Badge'
import { MessageSquare, FileText, ArrowLeft } from 'lucide-react'
import type { Document } from '@/types/database.types'

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .eq('user_id', user!.id)
    .single()

  if (!data) notFound()

  const doc = data as Document

  const details = [
    { label: '파일명', value: doc.original_name },
    { label: '분류', value: <CategoryBadge category={doc.category} /> },
    { label: '상태', value: <StatusBadge status={doc.status} /> },
    { label: '파일 형식', value: doc.file_type.toUpperCase() },
    { label: '파일 크기', value: formatBytes(doc.file_size_bytes) },
    { label: '페이지 수', value: doc.page_count ? `${doc.page_count}페이지` : '-' },
    { label: '청크 수', value: doc.chunk_count ? `${doc.chunk_count}개` : '-' },
    { label: '프로젝트 코드', value: doc.project_code || '-' },
    { label: '업로드일', value: new Date(doc.created_at).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' }) },
  ]

  return (
    <div>
      <Header
        title="문서 상세"
        actions={
          <Link href="/documents">
            <Button variant="secondary" icon={<ArrowLeft size={16} />}>
              목록으로
            </Button>
          </Link>
        }
      />
      <div className="max-w-2xl mx-auto px-6 py-6">
        <Card padding="none" className="mb-6">
          {/* Document header */}
          <div className="p-6 border-b border-gray-100">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 bg-primary-light rounded-xl flex items-center justify-center shrink-0">
                <FileText size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900 break-all">{doc.original_name}</h2>
                {doc.description && (
                  <p className="text-sm text-gray-500 mt-1">{doc.description}</p>
                )}
                {doc.tags && doc.tags.length > 0 && (
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {doc.tags.map((tag) => (
                      <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details */}
          <div className="divide-y divide-gray-50">
            {details.map(({ label, value }) => (
              <div key={label} className="flex items-center px-6 py-3.5">
                <span className="w-32 text-sm text-gray-500 shrink-0">{label}</span>
                <span className="text-sm text-gray-900 flex-1">{value}</span>
              </div>
            ))}
          </div>

          {/* Error message */}
          {doc.error_message && (
            <div className="mx-6 mb-6 px-4 py-3 bg-status-error-light border border-status-error/20 rounded-btn">
              <p className="text-sm text-status-error">{doc.error_message}</p>
            </div>
          )}
        </Card>

        {/* Actions */}
        {doc.status === 'ready' && (
          <div className="flex gap-3">
            <Link href="/chat" className="flex-1">
              <Button className="w-full" icon={<MessageSquare size={16} />}>
                이 문서로 AI 질문하기
              </Button>
            </Link>
          </div>
        )}

        {doc.status === 'error' && (
          <Button
            variant="secondary"
            className="w-full"
            onClick={async () => {
              await fetch(`/api/process/${doc.id}`, { method: 'POST' })
            }}
          >
            재처리 시도
          </Button>
        )}
      </div>
    </div>
  )
}
