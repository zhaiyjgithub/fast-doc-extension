import { cn } from '@/lib/utils'

type EncounterStatusBadgeProps = {
  status: string
  className?: string
}

function normalizedStatus(status: string): string {
  return status.trim().toLowerCase()
}

function statusClasses(status: string): string {
  const value = normalizedStatus(status)
  if (value === 'done') {
    return 'border border-emerald-300/80 bg-emerald-100 text-emerald-900 dark:border-emerald-800/80 dark:bg-emerald-950/50 dark:text-emerald-100'
  }
  if (value === 'in_progress') {
    return 'border border-amber-300/80 bg-amber-100 text-amber-900 dark:border-amber-800/80 dark:bg-amber-950/50 dark:text-amber-100'
  }
  if (value === 'failed') {
    return 'border border-rose-300/80 bg-rose-100 text-rose-900 dark:border-rose-800/80 dark:bg-rose-950/50 dark:text-rose-100'
  }
  return 'bg-secondary text-secondary-foreground'
}

function statusLabel(status: string): string {
  const value = status.trim()
  if (!value) return 'unknown'
  return value.replaceAll('_', ' ')
}

export function EncounterStatusBadge({ status, className }: EncounterStatusBadgeProps) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        statusClasses(status),
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  )
}
