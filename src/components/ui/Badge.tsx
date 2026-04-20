import { clsx } from 'clsx'
import type { DocumentCategory, DocumentStatus } from '@/types/database.types'

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning' | 'error' | 'info'

interface BadgeProps {
  variant?: BadgeVariant
  size?: 'sm' | 'md'
  children: React.ReactNode
  className?: string
}

const variantClasses: Record<BadgeVariant, string> = {
  default: 'bg-gray-100 text-gray-600',
  primary: 'bg-primary-light text-primary',
  success: 'bg-status-success-light text-status-success',
  warning: 'bg-status-warning-light text-status-warning',
  error: 'bg-status-error-light text-status-error',
  info: 'bg-status-info-light text-status-info',
}

export function Badge({ variant = 'default', size = 'sm', children, className }: BadgeProps) {
  return (
    <span
      className={clsx(
        'inline-flex items-center font-medium rounded-full',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  )
}

// Specialized badges
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  permit: '인허가',
  standard: '설계기준',
  report: '보고서',
  drawing: '도면',
  specification: '시방서',
  contract: '계약서',
  other: '기타',
}

export const STATUS_CONFIG: Record<
  DocumentStatus,
  { label: string; variant: BadgeVariant }
> = {
  uploading: { label: '업로드 중', variant: 'info' },
  processing: { label: '처리 중', variant: 'warning' },
  ready: { label: '준비 완료', variant: 'success' },
  error: { label: '오류', variant: 'error' },
}

export function CategoryBadge({ category }: { category: DocumentCategory }) {
  return <Badge variant="primary">{CATEGORY_LABELS[category]}</Badge>
}

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const config = STATUS_CONFIG[status]
  return <Badge variant={config.variant}>{config.label}</Badge>
}
