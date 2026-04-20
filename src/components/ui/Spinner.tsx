import { clsx } from 'clsx'

interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  color?: 'primary' | 'white' | 'gray'
  className?: string
}

const sizeClasses = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
const colorClasses = {
  primary: 'border-primary/20 border-t-primary',
  white: 'border-white/30 border-t-white',
  gray: 'border-gray-200 border-t-gray-500',
}

export function Spinner({ size = 'md', color = 'primary', className }: SpinnerProps) {
  return (
    <span
      className={clsx(
        'inline-block rounded-full border-2 animate-spin',
        sizeClasses[size],
        colorClasses[color],
        className
      )}
      aria-label="로딩 중"
    />
  )
}
