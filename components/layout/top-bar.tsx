import * as React from 'react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  action?: React.ReactNode
  className?: string
}

export function TopBar({ title = 'FastDoc', action, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'flex h-14 w-full shrink-0 items-center justify-between border-b border-border bg-background px-4',
        className,
      )}
    >
      <span className="text-base font-semibold tracking-tight">{title}</span>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </header>
  )
}
