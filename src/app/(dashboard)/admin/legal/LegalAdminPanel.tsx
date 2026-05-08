'use client'

import { useState, useTransition, useMemo } from 'react'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { Upload, RefreshCw, CheckCircle2, AlertTriangle, Search } from 'lucide-react'
import type { LegalReference, LegalTopic } from '@/types/law.types'

interface Stats {
  totalRefs: number
  verified: number
  lowConfidence: number
  lastSync: string | null
}

interface Props {
  topics: LegalTopic[]
  references: LegalReference[]
  stats: Stats
}

export function LegalAdminPanel({ topics, references: initialRefs, stats }: Props) {
  const [references, setReferences] = useState(initialRefs)
  const [filter, setFilter] = useState<'low' | 'unverified' | 'all'>('low')
  const [busy, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)

  const topicById = useMemo(() => new Map(topics.map((t) => [t.id, t])), [topics])

  const filtered = references.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'unverified') return !r.verified_at
    return r.confidence < 0.7 && !r.verified_at
  })

  async function handleSyncPdf(file: File) {
    setFeedback(null)
    const form = new FormData()
    form.append('file', file)
    const res = await fetch('/api/legal/admin/sync-pdf', { method: 'POST', body: form })
    const json = await res.json()
    if (!res.ok) {
      setFeedback(`동기화 실패: ${json.error ?? '알 수 없는 오류'}`)
      return
    }
    setFeedback(
      `동기화 완료 — 항목 ${json.summary.topics_upserted}건 / 참조 ${json.summary.references_upserted}건 (검증 보존 ${json.summary.references_preserved}건)`
    )
    setTimeout(() => location.reload(), 1200)
  }

  async function handleRefreshAll() {
    setFeedback(null)
    const res = await fetch('/api/legal/admin/refresh-all', { method: 'POST' })
    const json = await res.json()
    if (!res.ok) {
      setFeedback(`갱신 실패: ${json.error ?? '알 수 없는 오류'}`)
      return
    }
    setFeedback(
      `법제처 캐시 갱신 — 성공 ${json.stats.refreshed}건 / 실패 ${json.stats.failed}건 (만료 정리 ${json.expired_purged}건)`
    )
  }

  async function handleVerify(refId: string) {
    const res = await fetch(`/api/legal/admin/references/${refId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ verified: true, confidence: 1 }),
    })
    if (res.ok) {
      const json = await res.json()
      setReferences((prev) => prev.map((r) => (r.id === refId ? (json.reference as LegalReference) : r)))
    }
  }

  async function handleUpdate(refId: string, patch: Partial<LegalReference>) {
    const res = await fetch(`/api/legal/admin/references/${refId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (res.ok) {
      const json = await res.json()
      setReferences((prev) => prev.map((r) => (r.id === refId ? (json.reference as LegalReference) : r)))
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card padding="md">
          <p className="text-xs text-gray-500 font-medium">전체 참조</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalRefs}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs text-gray-500 font-medium">수동 검증 완료</p>
          <p className="text-2xl font-bold text-status-success mt-1">{stats.verified}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs text-gray-500 font-medium">검증 필요(낮은 신뢰도)</p>
          <p className="text-2xl font-bold text-status-warning mt-1">{stats.lowConfidence}</p>
        </Card>
        <Card padding="md">
          <p className="text-xs text-gray-500 font-medium">마지막 캐시 갱신</p>
          <p className="text-sm font-medium text-gray-900 mt-2">
            {stats.lastSync ? new Date(stats.lastSync).toLocaleString('ko-KR') : '없음'}
          </p>
        </Card>
      </div>

      <Card padding="md">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900">동기화 / 갱신</p>
            <p className="text-xs text-gray-500 mt-0.5">
              PDF 업로드: 업무 항목·법령 참조 자동 추출 · 검증 완료 항목은 보존
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium border border-gray-200 rounded-btn cursor-pointer hover:bg-gray-50">
              <Upload size={14} />
              PDF 동기화
              <input
                type="file"
                accept="application/pdf"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) startTransition(() => void handleSyncPdf(f))
                }}
              />
            </label>
            <button
              disabled={busy}
              onClick={() => startTransition(() => void handleRefreshAll())}
              className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium text-white bg-primary rounded-btn hover:opacity-90 disabled:opacity-50"
            >
              <RefreshCw size={14} className={busy ? 'animate-spin' : ''} /> 전체 캐시 갱신
            </button>
          </div>
        </div>
        {busy && (
          <div className="mt-3 text-sm text-gray-500 inline-flex items-center gap-2">
            <Spinner size="sm" /> 처리 중입니다... 시간이 다소 소요될 수 있습니다.
          </div>
        )}
        {feedback && (
          <div className="mt-3 text-sm bg-status-info-light text-status-info rounded-btn px-3 py-2">
            {feedback}
          </div>
        )}
      </Card>

      <Card padding="md">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-gray-900">법령 매핑 검증</p>
          <div className="flex items-center gap-1 text-xs">
            <FilterChip active={filter === 'low'} onClick={() => setFilter('low')}>
              낮은 신뢰도
            </FilterChip>
            <FilterChip active={filter === 'unverified'} onClick={() => setFilter('unverified')}>
              미검증
            </FilterChip>
            <FilterChip active={filter === 'all'} onClick={() => setFilter('all')}>
              전체
            </FilterChip>
          </div>
        </div>
        {filtered.length === 0 ? (
          <p className="text-sm text-gray-500 py-4 text-center">표시할 참조가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {filtered.map((r) => (
              <ReferenceRow
                key={r.id}
                reference={r}
                topic={topicById.get(r.topic_id)}
                onVerify={() => handleVerify(r.id)}
                onUpdate={(patch) => handleUpdate(r.id, patch)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={
        'px-2.5 py-1 rounded-full font-medium border transition-colors ' +
        (active
          ? 'bg-primary-light border-primary text-primary'
          : 'border-gray-200 text-gray-600 hover:bg-gray-50')
      }
    >
      {children}
    </button>
  )
}

function ReferenceRow({
  reference,
  topic,
  onVerify,
  onUpdate,
}: {
  reference: LegalReference
  topic: LegalTopic | undefined
  onVerify: () => void
  onUpdate: (patch: Partial<LegalReference>) => void
}) {
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<Array<{ name: string; law_id: string; mst: string; ministry: string | null }>>([])

  async function searchLaw() {
    setSearching(true)
    try {
      const res = await fetch(
        `/api/legal/search?query=${encodeURIComponent(reference.canonical_law_name ?? reference.law_name)}`
      )
      const json = await res.json()
      setResults(
        (json.remote ?? []).slice(0, 5).map((r: { name: string; law_id: string; mst: string; ministry: string | null }) => ({
          name: r.name,
          law_id: r.law_id,
          mst: r.mst,
          ministry: r.ministry,
        }))
      )
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="border border-gray-100 rounded-btn p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {topic && (
              <Badge variant="default" size="sm">
                {topic.category} · {topic.title}
              </Badge>
            )}
            <Badge variant={reference.api_target === 'admrul' ? 'warning' : 'primary'} size="sm">
              {reference.api_target}
            </Badge>
            <span className="text-xs text-gray-400">
              신뢰도 {(reference.confidence * 100).toFixed(0)}%
            </span>
            {reference.verified_at && (
              <Badge variant="success" size="sm">
                <CheckCircle2 size={10} className="mr-1" /> 검증됨
              </Badge>
            )}
            {!reference.verified_at && reference.confidence < 0.7 && (
              <Badge variant="warning" size="sm">
                <AlertTriangle size={10} className="mr-1" /> 검증 필요
              </Badge>
            )}
          </div>
          <p className="font-medium text-sm text-gray-900 mt-1.5">
            {reference.canonical_law_name ?? reference.law_name}
            {reference.article_ref && (
              <span className="ml-2 text-primary font-mono">{reference.article_ref}</span>
            )}
          </p>
          <p className="text-xs text-gray-500 mt-0.5">
            PDF 표기: {reference.law_name}
            {reference.law_id && <span className="ml-2 font-mono">law_id={reference.law_id}</span>}
            {reference.mst && <span className="ml-2 font-mono">mst={reference.mst}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={searchLaw}
            disabled={searching}
            className="text-xs px-2 py-1 border border-gray-200 rounded-btn hover:bg-gray-50 inline-flex items-center gap-1"
          >
            <Search size={12} /> 법제처 매핑
          </button>
          {!reference.verified_at && (
            <button
              onClick={onVerify}
              className="text-xs px-2 py-1 bg-primary text-white rounded-btn hover:opacity-90"
            >
              검증 완료
            </button>
          )}
        </div>
      </div>
      {results.length > 0 && (
        <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
          {results.map((r) => (
            <button
              key={`${r.law_id}-${r.mst}`}
              onClick={() =>
                onUpdate({
                  canonical_law_name: r.name,
                  law_id: r.law_id,
                  mst: r.mst,
                  ministry: r.ministry,
                  confidence: 0.95,
                })
              }
              className="w-full text-left text-xs px-2 py-1.5 rounded-btn hover:bg-primary-light"
            >
              <span className="font-medium text-gray-900">{r.name}</span>
              <span className="text-gray-500 ml-2">{r.ministry}</span>
              <span className="text-gray-400 ml-2 font-mono">{r.law_id}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
