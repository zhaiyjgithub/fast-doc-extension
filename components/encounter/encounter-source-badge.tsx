import { cn } from '@/lib/utils'

type EncounterSourceBadgeProps = {
  source: string | null | undefined
  className?: string
}

function normalizedSource(source: string | null | undefined): string {
  return (source ?? '').trim().toLowerCase()
}

function sourceLabel(source: string | null | undefined): string {
  const value = normalizedSource(source)
  if (!value) return 'UNKNOWN'
  if (value === 'voice') return 'VOICE'
  if (value === 'paste') return 'PASTE'
  return value.replace(/_/g, ' ').toUpperCase()
}

function sourceClasses(source: string | null | undefined): string {
  const value = normalizedSource(source)
  if (value === 'voice') {
    return 'border border-cyan-300/80 bg-cyan-100 text-cyan-900 dark:border-cyan-800/80 dark:bg-cyan-950/50 dark:text-cyan-100'
  }
  if (value === 'paste') {
    return 'border border-fuchsia-300/80 bg-fuchsia-100 text-fuchsia-900 dark:border-fuchsia-800/80 dark:bg-fuchsia-950/50 dark:text-fuchsia-100'
  }
  return 'bg-secondary text-secondary-foreground'
}

export function EncounterSourceBadge({ source, className }: EncounterSourceBadgeProps) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
        sourceClasses(source),
        className,
      )}
    >
      {sourceLabel(source)}
    </span>
  )
}
