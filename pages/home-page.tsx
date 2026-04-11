import * as React from 'react'
import { format } from 'date-fns'
import { EncounterCodeBadges } from '@/components/encounter-code-badges'
import { PatientBanner } from '@/components/layout/patient-banner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Zap, Bell, Mic, Search, UserRoundSearch } from 'lucide-react'
import { toast } from 'sonner'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import { formatEncounterDob, MOCK_ENCOUNTERS } from '@/lib/mock-encounters'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'

interface HomePageProps {
  patient: Patient | null
  username?: string
  onChangePatient: () => void
  /** Opens patient sheet in match mode (same as Record tab match flow). */
  onOpenMatchPatientPicker?: () => void
  onNavigate: (page: 'recording' | 'soap') => void
}

function greetingForHour(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export function HomePage({
  patient,
  username = 'there',
  onChangePatient,
  onOpenMatchPatientPicker,
  onNavigate,
}: HomePageProps) {
  const displayName = username.trim() || 'there'

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <header className="sticky top-0 z-40 flex h-12 w-full shrink-0 items-center justify-between border-b border-border/60 bg-background/80 px-4 backdrop-blur-md">
        <div className="flex cursor-pointer items-center gap-2 text-primary active:scale-95">
          <Zap className="size-5" aria-hidden />
          <span className="text-lg font-bold tracking-tight text-foreground">FastDoc</span>
        </div>
        <button
          type="button"
          onClick={() => toast.message('No new notifications')}
          className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground active:scale-95"
          aria-label="Notifications"
        >
          <Bell className="size-5" />
        </button>
      </header>

      {patient && (
        <PatientBanner
          name={patient.name}
          dob={patient.dob}
          onDismiss={onChangePatient}
        />
      )}

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <div className="min-w-0 space-y-6 px-4 pb-24 pt-4">
          <section className="space-y-2">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-extrabold tracking-tight text-foreground">
                  {greetingForHour()}, {displayName}{' '}
                  <span aria-hidden>👋</span>
                </h1>
                <p className="mt-0.5 text-sm font-medium text-muted-foreground">
                  {format(new Date(), 'EEEE, MMM d')}
                </p>
              </div>
              <div className="shrink-0 rounded-full bg-primary/30 px-3 py-1">
                <span className="text-[11px] font-bold uppercase tracking-wide text-foreground">
                  Primary care
                </span>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                type="button"
                onClick={() => onNavigate('recording')}
                className="flex min-h-[120px] flex-col justify-between rounded-lg bg-primary p-3 text-left shadow-sm transition-all hover:brightness-95 active:scale-[0.99] sm:min-h-[132px] sm:p-4"
              >
                <div className="self-start rounded-full bg-white/30 p-1.5 sm:p-2">
                  <Mic className="size-4 text-primary-foreground sm:size-5" aria-hidden />
                </div>
                <span className="text-xs font-bold leading-snug text-primary-foreground sm:text-sm">
                  New recording
                </span>
              </button>

              <button
                type="button"
                onClick={onChangePatient}
                className="flex min-h-[120px] flex-col justify-between rounded-lg border border-border/60 bg-card p-3 text-left shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.99] sm:min-h-[132px] sm:p-4"
              >
                <div className="self-start rounded-full bg-muted p-1.5 sm:p-2">
                  <Search className="size-4 text-muted-foreground sm:size-5" aria-hidden />
                </div>
                <span className="text-xs font-bold leading-snug text-foreground sm:text-sm">
                  Find patient
                </span>
              </button>

              <button
                type="button"
                onClick={() => onOpenMatchPatientPicker?.()}
                className="flex min-h-[120px] flex-col justify-between rounded-lg border border-emerald-200/90 bg-emerald-50 p-3 text-left shadow-sm transition-colors hover:border-emerald-300 hover:bg-emerald-100/90 active:scale-[0.99] dark:border-emerald-800/80 dark:bg-emerald-950/45 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/65 sm:min-h-[132px] sm:p-4"
              >
                <div className="self-start rounded-full bg-emerald-100 p-1.5 dark:bg-emerald-900/55 sm:p-2">
                  <UserRoundSearch className="size-4 text-emerald-700 dark:text-emerald-300 sm:size-5" aria-hidden />
                </div>
                <span className="text-xs font-bold leading-snug text-emerald-950 dark:text-emerald-50 sm:text-sm">
                  Match Patient
                </span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Recent encounters</h2>
            <div className="space-y-3">
              {MOCK_ENCOUNTERS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onNavigate('soap')}
                  className={cn(
                    'flex w-full items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]',
                    e.muted && 'opacity-80',
                  )}
                  aria-label={`Open AI EMR for ${e.name}, DOB ${formatEncounterDob(e.dob)}, ${e.gender}, ${e.when}`}
                >
                  <Avatar className="size-12 shrink-0 rounded-full">
                    <AvatarFallback
                      className={cn('text-xs font-semibold', avatarFallbackClassForName(e.name))}
                    >
                      {e.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <h3 className="flex min-w-0 flex-1 items-baseline gap-0 overflow-hidden font-bold text-foreground">
                        <span className="min-w-0 flex-1 truncate">{e.name}</span>
                        <span className="shrink-0">, {e.age}</span>
                      </h3>
                      <p className="shrink-0 pl-2 text-right text-[11px] font-semibold leading-snug text-muted-foreground whitespace-nowrap">
                        {e.when}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      DOB {formatEncounterDob(e.dob)}
                      <span className="text-muted-foreground/60"> · </span>
                      {e.gender}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase',
                          e.tagClass,
                        )}
                      >
                        {e.tag}
                      </span>
                    </div>
                    <EncounterCodeBadges icdCodes={e.icdCodes} cptCodes={e.cptCodes} />
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="relative overflow-hidden rounded-lg bg-slate-900 p-6 text-white dark:bg-zinc-950">
            <div className="relative z-10">
              <p className="mb-1 text-xs font-bold uppercase tracking-widest text-primary opacity-90">
                Weekly insight
              </p>
              <h3 className="mb-4 text-xl font-bold">
                You&apos;ve completed 24 notes this week.
              </h3>
              <div className="flex items-center gap-4">
                <div className="flex -space-x-2">
                  <div className="size-8 rounded-full border-2 border-slate-900 bg-slate-500 dark:border-zinc-950" />
                  <div className="size-8 rounded-full border-2 border-slate-900 bg-slate-600 dark:border-zinc-950" />
                  <div className="size-8 rounded-full border-2 border-slate-900 bg-slate-700 dark:border-zinc-950" />
                </div>
                <span className="text-xs font-medium text-slate-300">
                  +12% faster than last week
                </span>
              </div>
            </div>
            <div
              className="pointer-events-none absolute -bottom-10 -right-10 size-40 rounded-full bg-primary/20 blur-3xl"
              aria-hidden
            />
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
