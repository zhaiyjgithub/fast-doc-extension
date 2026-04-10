import * as React from 'react'
import { cn } from '@/lib/utils'
import { User, X } from 'lucide-react'

interface PatientBannerProps {
  name: string
  dob?: string
  onDismiss?: () => void
  className?: string
}

export function PatientBanner({ name, dob, onDismiss, className }: PatientBannerProps) {
  return (
    <div
      className={cn(
        'flex w-full shrink-0 items-center gap-3 border-b border-border bg-primary/10 px-4 py-2',
        className,
      )}
    >
      <User className="h-4 w-4 shrink-0 text-primary" />
      <div className="flex-1 min-w-0">
        <p className="truncate text-sm font-medium leading-tight">{name}</p>
        {dob && (
          <p className="text-xs text-muted-foreground">DOB: {dob}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Change patient"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
