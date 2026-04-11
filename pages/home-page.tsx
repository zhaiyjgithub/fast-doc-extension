import * as React from 'react'
import { format } from 'date-fns'
import { PatientBanner } from '@/components/layout/patient-banner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Zap, Bell, Mic, Search, FileText } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'

interface HomePageProps {
  patient: Patient | null
  username?: string
  onChangePatient: () => void
  onNavigate: (page: 'recording' | 'notes') => void
}

interface Encounter {
  id: string
  initials: string
  name: string
  age: number
  when: string
  tag: string
  tagClass: string
  dotClass: string
  muted?: boolean
}

const MOCK_ENCOUNTERS: Encounter[] = [
  {
    id: '1',
    initials: 'RM',
    name: 'Robert Miller',
    age: 72,
    when: 'Today • 09:15 AM',
    tag: 'Clinic',
    tagClass: 'bg-secondary text-secondary-foreground',
    dotClass: 'bg-emerald-500',
  },
  {
    id: '2',
    initials: 'SJ',
    name: 'Sarah Jenkins',
    age: 45,
    when: 'Today • 08:30 AM',
    tag: 'Emergency',
    tagClass: 'bg-primary/25 text-foreground',
    dotClass: 'bg-amber-500',
  },
  {
    id: '3',
    initials: 'JW',
    name: 'James Wilson',
    age: 29,
    when: 'Yesterday • 04:45 PM',
    tag: 'Follow-up',
    tagClass: 'bg-secondary text-secondary-foreground',
    dotClass: 'bg-muted-foreground/40',
    muted: true,
  },
]

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

      <ScrollArea className="min-w-0 flex-1">
        <div className="min-w-0 space-y-8 px-5 pb-24 pt-6">
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
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onNavigate('recording')}
                className="flex h-[140px] flex-col justify-between rounded-lg bg-primary p-5 text-left shadow-sm transition-all hover:brightness-95 active:scale-[0.99]"
              >
                <div className="self-start rounded-full bg-white/30 p-2">
                  <Mic className="size-5 text-primary-foreground" aria-hidden />
                </div>
                <span className="text-base font-bold leading-tight text-primary-foreground">
                  New recording
                </span>
              </button>

              <button
                type="button"
                onClick={onChangePatient}
                className="flex h-[140px] flex-col justify-between rounded-lg border border-border/60 bg-card p-5 text-left shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.99]"
              >
                <div className="self-start rounded-full bg-muted p-2">
                  <Search className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <span className="text-base font-bold leading-tight text-foreground">
                  Find patient
                </span>
              </button>

              <button
                type="button"
                onClick={() => onNavigate('notes')}
                className="col-span-2 flex h-[140px] flex-col justify-between rounded-lg border border-border/60 bg-card p-5 text-left shadow-sm transition-colors hover:bg-muted/60 active:scale-[0.99]"
              >
                <div className="self-start rounded-full bg-muted p-2">
                  <FileText className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <span className="text-base font-bold leading-tight text-foreground">
                  Recent notes
                </span>
              </button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-end justify-between gap-2">
              <h2 className="text-lg font-bold text-foreground">Recent encounters</h2>
              <button
                type="button"
                onClick={() => onNavigate('notes')}
                className="shrink-0 text-sm font-semibold text-primary underline-offset-4 hover:underline"
              >
                View all
              </button>
            </div>
            <div className="space-y-3">
              {MOCK_ENCOUNTERS.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center gap-4 rounded-lg border border-border/60 bg-card p-4 transition-colors hover:bg-muted/40',
                    e.muted && 'opacity-80',
                  )}
                >
                  <Avatar className="size-12 shrink-0 rounded-full">
                    <AvatarFallback className="text-xs font-semibold">
                      {e.initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="truncate font-bold text-foreground">
                        {e.name}, {e.age}
                      </h3>
                      <span
                        className={cn('mt-1.5 size-2 shrink-0 rounded-full', e.dotClass)}
                        aria-hidden
                      />
                    </div>
                    <p className="text-xs font-medium text-muted-foreground">{e.when}</p>
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
                  </div>
                </div>
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
