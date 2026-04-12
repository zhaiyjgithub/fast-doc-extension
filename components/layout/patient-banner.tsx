import * as React from 'react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return (a + b).toUpperCase()
  }
  const one = parts[0] ?? name.trim()
  if (one.length >= 2) return one.slice(0, 2).toUpperCase()
  return (one[0] ?? '?').toUpperCase()
}

interface PatientBannerProps {
  name: string
  dob?: string
  gender?: string
  onDismiss?: () => void
  className?: string
}

export function PatientBanner({ name, dob, gender, onDismiss, className }: PatientBannerProps) {
  const metaLine = [dob ? `DOB: ${dob}` : null, gender ?? null].filter(Boolean).join(' · ')
  const initials = initialsFromDisplayName(name)

  return (
    <div
      className={cn(
        'flex w-full shrink-0 items-center gap-4 border-b border-border bg-primary/10 px-4 py-2.5',
        className,
      )}
    >
      <Avatar className="size-12 shrink-0 rounded-full">
        <AvatarFallback className={cn('text-xs font-semibold', avatarFallbackClassForName(name))}>
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-tight">{name}</p>
        {metaLine ? <p className="truncate text-xs text-muted-foreground">{metaLine}</p> : null}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Remove selected patient"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
