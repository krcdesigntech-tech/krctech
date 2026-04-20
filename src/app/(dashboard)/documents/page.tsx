'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import { Plus, Search, Filter, FileText, Trash2 } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card } from '@/components/ui/Card'
import { StatusBadge, CategoryBadge, CATEGORY_LABELS } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Modal } from '@/components/ui/Modal'
import type { Document, DocumentCategory } from '@/types/database.types'

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const FILE_TYPE_ICONS: Record<string, string> = {
  pdf: '📄',
  docx: '📝',
  doc: '📝',
  xlsx: '📊',
  xls: '📊',
  hwpx: '📋',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function DocumentsPage() {
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Document | null>(null)
  const [deleting, setDeleting] = useState(false)

  const params = new URLSearchParams()
  if (search) params.set('search', search)
  if (categoryFilter) params.set('category', categoryFilter)

  const { data, mutate, isLoading } = useSWR<{ documents: Document[] }>(
    `/api/documents?${params}`,
    fetcher,
    { refreshInterval: 5000 }
  )

  const documents = data?.documents || []

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await fetch(`/api/documents/${deleteTarget.id}`, { method: 'DELETE' })
      mutate()
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <Header
        title="문서 관리"
        actions={
          <Link href="/documents/upload">
            <Button icon={<Plus size={16} />}>문서 업로드</Button>
          </Link>
        }
      />
      <div className="max-w-container mx-auto px-6 py-6">
        {/* Filters */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 max-w-xs">
            <Input
              placeholder="파일명 검색..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              icon={<Search size={16} />}
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter size={16} className="text-gray-400" />
            <div className="flex gap-1.5">
              <button
                onClick={() => setCategoryFilter('')}
                className={`px-3 py-1.5 rounded-btn text-xs font-medium transition-colors ${
                  !categoryFilter
                    ? 'bg-primary text-white'
                    : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                전체
              </button>
              {(Object.entries(CATEGORY_LABELS) as [DocumentCategory, string][]).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setCategoryFilter(categoryFilter === key ? '' : key)}
                  className={`px-3 py-1.5 rounded-btn text-xs font-medium transition-colors ${
                    categoryFilter === key
                      ? 'bg-primary text-white'
                      : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Document list */}
        {isLoading ? (
          <div className="flex justify-center py-16">
            <Spinner size="lg" />
          </div>
        ) : documents.length === 0 ? (
          <Card padding="lg" className="text-center py-16">
            <FileText size={48} className="text-gray-200 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">문서가 없습니다</p>
            <p className="text-sm text-gray-400 mt-1">
              인허가 절차, 설계기준 등 업무 문서를 업로드해 주세요.
            </p>
            <Link href="/documents/upload">
              <Button className="mt-4" icon={<Plus size={16} />}>
                문서 업로드
              </Button>
            </Link>
          </Card>
        ) : (
          <div className="bg-white border border-gray-200 rounded-card shadow-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">파일명</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">분류</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">상태</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">크기</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">청크</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">업로드일</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-lg">{FILE_TYPE_ICONS[doc.file_type] || '📄'}</span>
                        <div>
                          <Link
                            href={`/documents/${doc.id}`}
                            className="font-medium text-gray-900 hover:text-primary line-clamp-1"
                          >
                            {doc.original_name}
                          </Link>
                          {doc.project_code && (
                            <p className="text-xs text-gray-400">{doc.project_code}</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <CategoryBadge category={doc.category} />
                    </td>
                    <td className="px-4 py-3.5">
                      <StatusBadge status={doc.status} />
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {formatBytes(doc.file_size_bytes)}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {doc.chunk_count ?? '-'}
                    </td>
                    <td className="px-4 py-3.5 text-gray-500">
                      {new Date(doc.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => setDeleteTarget(doc)}
                        className="p-1.5 rounded text-gray-400 hover:text-status-error hover:bg-status-error-light transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="문서 삭제"
        size="sm"
      >
        <p className="text-sm text-gray-600 mb-6">
          <strong className="text-gray-900">{deleteTarget?.original_name}</strong>을(를) 삭제하시겠습니까?
          이 작업은 되돌릴 수 없습니다.
        </p>
        <div className="flex gap-2 justify-end">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            취소
          </Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            삭제
          </Button>
        </div>
      </Modal>
    </div>
  )
}
