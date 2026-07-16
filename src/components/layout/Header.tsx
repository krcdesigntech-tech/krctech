interface HeaderProps {
  title: string
  subtitle?: string
  rightLabel?: string
  actions?: React.ReactNode
}

export function Header({ title, subtitle, rightLabel, actions }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3.5">
      {(subtitle || rightLabel) && (
        <div className="flex items-center justify-between gap-4 mb-1.5">
          {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          {rightLabel && (
            <span className="hidden sm:inline text-[10px] text-gray-400 tracking-wide shrink-0 ml-auto">
              {rightLabel}
            </span>
          )}
        </div>
      )}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-lg font-bold text-gray-900">{title}</h1>
        {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  )
}
