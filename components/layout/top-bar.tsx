import * as React from 'react'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TopBarProps {
  title?: string
  action?: React.ReactNode
  /** Renders a back control before the title. */
  onBack?: () => void
  className?: string
}

export function TopBar({ title = 'FastDoc', action, onBack, className }: TopBarProps) {
  return (
    <header
      className={cn(
        'flex h-14 w-full shrink-0 items-center justify-between gap-2 border-b border-border bg-background px-4',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            className="-ml-1 flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" aria-hidden />
          </button>
        ) : null}
        <span className="min-w-0 truncate text-base font-semibold tracking-tight">{title}</span>
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </header>
  )
}
