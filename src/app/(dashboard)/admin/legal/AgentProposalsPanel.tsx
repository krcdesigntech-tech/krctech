'use client'

import { useState } from 'react'
import { Bot, Check, X } from 'lucide-react'
import { Card } from '@/components/ui/Card'

export interface AgentProposal {
  id: string
  kind: string
  payload: Record<string, unknown>
  rationale: string | null
  risk_level: string
  status: string
  created_at: string
}

const RISK_CLS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-600',
  medium: 'bg-amber-100 text-amber-700',
  high: 'bg-red-100 text-red-700',
}

export function AgentProposalsPanel({ initial }: { initial: AgentProposal[] }) {
  const [items, setItems] = useState(initial)
  const [busy, setBusy] = useState<string | null>(null)

  async function review(id: string, action: 'approve' | 'reject') {
    setBusy(id)
    try {
      const res = await fetch(`/api/legal/admin/proposals/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (res.ok) setItems((prev) => prev.filter((p) => p.id !== id))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card padding="none" className="mb-6">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-2">
        <Bot size={18} className="text-primary" />
        <h3 className="font-semibold text-gray-900">에이전트 제안</h3>
        <span className="text-xs text-gray-400">(Hermes 자가학습 — 승인 시 적용 대상)</span>
      </div>

      {items.length === 0 ? (
        <p className="px-6 py-8 text-center text-sm text-gray-400">대기중인 제안이 없습니다.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((p) => (
            <div key={p.id} className="px-6 py-4 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-gray-900">{p.kind}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${RISK_CLS[p.risk_level] ?? RISK_CLS.medium}`}>
                    {p.risk_level}
                  </span>
                </div>
                <p className="text-sm text-gray-700">
                  {(p.payload?.law_name as string) ||
                    (p.payload?.alias as string) ||
                    JSON.stringify(p.payload)}
                </p>
                {p.rationale && <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{p.rationale}</p>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => review(p.id, 'approve')}
                  disabled={busy === p.id}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-white hover:opacity-90 disabled:opacity-40"
                >
                  <Check size={13} /> 승인
                </button>
                <button
                  onClick={() => review(p.id, 'reject')}
                  disabled={busy === p.id}
                  className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                >
                  <X size={13} /> 거부
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="px-6 py-2.5 border-t border-gray-50 text-xs text-gray-400">
        승인된 제안은 <code>npm run agent:apply -- --all-approved</code> (또는 야간 Hermes 루프)에서 법제처 전문으로 적재됩니다.
      </p>
    </Card>
  )
}
