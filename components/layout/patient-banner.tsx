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
  onClick?: () => void
  className?: string
}

function formatDobDisplay(value: string): string {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return new Intl.DateTimeFormat('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(parsed)
}

function ageFromDob(value: string): string | null {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - parsed.getFullYear()
  const monthDelta = now.getMonth() - parsed.getMonth()
  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < parsed.getDate())) {
    age -= 1
  }
  if (!Number.isFinite(age) || age < 0) return null
  return `${age}y`
}

export function PatientBanner({ name, dob, gender, onDismiss, onClick, className }: PatientBannerProps) {
  const formattedDob = dob ? formatDobDisplay(dob) : null
  const age = dob ? ageFromDob(dob) : null
  const metaLine = [formattedDob ? `DOB: ${formattedDob}` : null, age, gender ?? null]
    .filter(Boolean)
    .join(' · ')
  const initials = initialsFromDisplayName(name)

  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={cn(
        'flex w-full shrink-0 items-center gap-4 border-b border-border bg-primary/10 px-4 py-2.5',
        onClick &&
          'cursor-pointer transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
          onClick={(event) => {
            event.stopPropagation()
            onDismiss()
          }}
          className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Remove selected patient"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
