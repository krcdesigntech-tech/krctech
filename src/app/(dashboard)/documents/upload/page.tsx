'use client'

export const dynamic = 'force-dynamic'

import { useState, useCallback } from 'react'
import { useDropzone } from 'react-dropzone'
import { useRouter } from 'next/navigation'
import { Upload, X, FileText, CheckCircle, AlertCircle } from 'lucide-react'
import { Header } from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import type { DocumentCategory } from '@/types/database.types'

const ACCEPT = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/haansofthwpx': ['.hwpx'],
}

const CATEGORY_OPTIONS: { value: DocumentCategory; label: string }[] = [
  { value: 'permit', label: '인허가 절차' },
  { value: 'standard', label: '설계기준' },
  { value: 'report', label: '보고서' },
  { value: 'drawing', label: '도면' },
  { value: 'specification', label: '시방서' },
  { value: 'contract', label: '계약서' },
  { value: 'other', label: '기타' },
]

type UploadStatus = 'idle' | 'uploading' | 'processing' | 'done' | 'error'

interface FileItem {
  file: File
  category: DocumentCategory
  status: UploadStatus
  progress: number
  error?: string
  documentId?: string
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function UploadPage() {
  const router = useRouter()
  const [files, setFiles] = useState<FileItem[]>([])
  const [uploading, setUploading] = useState(false)

  const onDrop = useCallback((accepted: File[]) => {
    const newItems: FileItem[] = accepted.map((f) => ({
      file: f,
      category: 'other',
      status: 'idle',
      progress: 0,
    }))
    setFiles((prev) => [...prev, ...newItems])
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    maxSize: 100 * 1024 * 1024,
    multiple: true,
  })

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  function setCategory(index: number, category: DocumentCategory) {
    setFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, category } : item))
    )
  }

  function updateFile(index: number, updates: Partial<FileItem>) {
    setFiles((prev) => prev.map((item, i) => (i === index ? { ...item, ...updates } : item)))
  }

  async function handleUpload() {
    const pending = files.filter((f) => f.status === 'idle')
    if (pending.length === 0) return

    setUploading(true)

    for (let i = 0; i < files.length; i++) {
      const item = files[i]
      if (item.status !== 'idle') continue

      try {
        // 1. Get presigned URL
        updateFile(i, { status: 'uploading', progress: 10 })
        const urlRes = await fetch('/api/documents/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            filename: item.file.name,
            mimeType: item.file.type || 'application/octet-stream',
            fileSizeBytes: item.file.size,
            category: item.category,
          }),
        })

        if (!urlRes.ok) {
          const err = await urlRes.json()
          throw new Error(err.error || '업로드 URL 생성 실패')
        }

        const { uploadUrl, documentId } = await urlRes.json()
        updateFile(i, { progress: 30, documentId })

        // 2. Upload to R2
        const uploadRes = await fetch(uploadUrl, {
          method: 'PUT',
          body: item.file,
          headers: { 'Content-Type': item.file.type || 'application/octet-stream' },
        })

        if (!uploadRes.ok) throw new Error('파일 업로드 실패')

        updateFile(i, { status: 'processing', progress: 60 })

        // 3. Trigger processing
        const processRes = await fetch(`/api/process/${documentId}`, { method: 'POST' })

        if (!processRes.ok) {
          const err = await processRes.json()
          throw new Error(err.error || '문서 처리 실패')
        }

        updateFile(i, { status: 'done', progress: 100 })
      } catch (err) {
        updateFile(i, {
          status: 'error',
          error: err instanceof Error ? err.message : '업로드 중 오류',
        })
      }
    }

    setUploading(false)
  }

  const allDone = files.length > 0 && files.every((f) => f.status === 'done')

  return (
    <div>
      <Header title="문서 업로드" />
      <div className="max-w-2xl mx-auto px-6 py-6">
        {/* Drop zone */}
        <Card padding="none" className="mb-6">
          <div
            {...getRootProps()}
            className={`p-10 border-2 border-dashed rounded-card cursor-pointer transition-colors text-center ${
              isDragActive
                ? 'border-primary bg-primary-light'
                : 'border-gray-200 hover:border-primary hover:bg-primary-50'
            }`}
          >
            <input {...getInputProps()} />
            <Upload size={36} className={`mx-auto mb-3 ${isDragActive ? 'text-primary' : 'text-gray-300'}`} />
            <p className="font-semibold text-gray-700">
              {isDragActive ? '파일을 여기에 놓으세요' : '파일을 드래그하거나 클릭하여 선택'}
            </p>
            <p className="text-sm text-gray-400 mt-2">
              PDF, DOCX, XLSX, HWPX · 최대 100MB
            </p>
            <p className="text-xs text-gray-300 mt-1">
              ⚠ 스캔 이미지 PDF는 지원하지 않습니다. HWP는 HWPX로 변환 후 업로드해 주세요.
            </p>
          </div>
        </Card>

        {/* File list */}
        {files.length > 0 && (
          <div className="space-y-3 mb-6">
            {files.map((item, i) => (
              <Card key={i} padding="sm">
                <div className="flex items-center gap-3">
                  <FileText size={20} className="text-gray-400 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.file.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(item.file.size)}</p>
                  </div>

                  {item.status === 'idle' && (
                    <select
                      value={item.category}
                      onChange={(e) => setCategory(i, e.target.value as DocumentCategory)}
                      className="text-xs border border-gray-200 rounded-btn px-2 py-1 text-gray-700"
                    >
                      {CATEGORY_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  )}

                  {item.status === 'uploading' && (
                    <div className="flex items-center gap-2">
                      <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all"
                          style={{ width: `${item.progress}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400">{item.progress}%</span>
                    </div>
                  )}

                  {item.status === 'processing' && (
                    <span className="text-xs text-status-warning font-medium">AI 처리 중...</span>
                  )}

                  {item.status === 'done' && (
                    <CheckCircle size={18} className="text-status-success" />
                  )}

                  {item.status === 'error' && (
                    <div className="flex items-center gap-1.5 text-status-error">
                      <AlertCircle size={16} />
                      <span className="text-xs">{item.error}</span>
                    </div>
                  )}

                  {item.status === 'idle' && (
                    <button
                      onClick={() => removeFile(i)}
                      className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          {allDone ? (
            <Button className="flex-1" onClick={() => router.push('/documents')}>
              문서 목록으로 이동
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                onClick={() => router.push('/documents')}
              >
                취소
              </Button>
              <Button
                className="flex-1"
                loading={uploading}
                disabled={files.filter((f) => f.status === 'idle').length === 0}
                onClick={handleUpload}
                icon={<Upload size={16} />}
              >
                {uploading ? '업로드 중...' : `${files.filter((f) => f.status === 'idle').length}개 파일 업로드`}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
