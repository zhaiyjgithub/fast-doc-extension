import * as React from 'react'
import { PatientBanner } from '@/components/layout/patient-banner'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Bell, Mic, Search, UserRoundSearch } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { toast } from 'sonner'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { EncounterSummary } from '@/lib/encounter-api'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'

const homePageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const homePageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

interface HomePageProps {
  patient: Patient | null
  /** Login id (e.g. email); used to derive "Dr. …" when `doctorDisplayName` is omitted. */
  username?: string
  /** Explicit provider name for the header (e.g. "Jane Smith" → shown as "Dr. Jane Smith"). */
  doctorDisplayName?: string
  /** Specialty badge below the navbar (e.g. Primary care). */
  providerSpecialty?: string
  /** Site / EHR badge below the navbar (e.g. iClinic). */
  clinicSiteLabel?: string
  /** Opens the patient search sheet (e.g. Find patient). */
  onChangePatient: () => void
  /** Clears the toolbar-selected patient without opening the sheet (banner close). */
  onClearSelectedPatient: () => void
  /** Opens patient sheet in match mode (same as Record tab match flow). */
  onOpenMatchPatientPicker?: () => void
  onNavigate: (page: 'recording' | 'soap') => void
  encounters: EncounterSummary[]
  onOpenEncounter: (encounterId: string) => void
  /** Opens patient demographics for an encounter (name row). */
  onOpenEncounterPatient?: (encounterId: string) => void
}

function doctorHeaderLabel(username: string, explicit?: string): string {
  const normalizeDr = (s: string) => {
    const rest = s.replace(/^dr\.?\s*/i, '').trim()
    return rest ? `Dr. ${rest}` : 'Dr. User'
  }
  const e = explicit?.trim()
  if (e) {
    if (/^dr\.?/i.test(e)) return normalizeDr(e)
    return `Dr. ${e}`
  }
  const t = username.trim()
  if (!t) return 'Dr. User'
  if (/^dr\.?/i.test(t)) return normalizeDr(t)
  if (t.includes('@')) {
    const local = (t.split('@')[0] ?? '').replace(/[._-]+/g, ' ')
    const words = local.trim().split(/\s+/).filter(Boolean)
    const pretty = words
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
    return pretty ? `Dr. ${pretty}` : 'Dr. User'
  }
  const cap = t.charAt(0).toUpperCase() + t.slice(1)
  return `Dr. ${cap}`
}

function nameForAvatarColor(doctorLabel: string): string {
  const withoutPrefix = doctorLabel.replace(/^dr\.?\s+/i, '').trim()
  // Ignore trailing credentials for avatar color/initial seed.
  const baseName = withoutPrefix.split(',')[0]?.trim() || withoutPrefix
  return baseName || doctorLabel
}

function initialsForDoctor(doctorLabel: string): string {
  const seed = nameForAvatarColor(doctorLabel)
  const parts = seed.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }
  if (parts[0] && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0]?.charAt(0) ?? '?').toUpperCase()
}

function shortPatientId(patientId: string): string {
  const compact = patientId.replace(/[^a-zA-Z0-9]/g, '')
  if (compact.length >= 8) {
    return compact.slice(0, 8)
  }
  return patientId.slice(0, 8) || patientId
}

function formatEncounterTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }
  return date.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function HomePage({
  patient,
  username = '',
  doctorDisplayName: doctorDisplayNameProp,
  providerSpecialty = 'Primary care',
  clinicSiteLabel = 'iClinic',
  onChangePatient,
  onClearSelectedPatient,
  onOpenMatchPatientPicker,
  onNavigate,
  encounters,
  onOpenEncounter,
  onOpenEncounterPatient,
}: HomePageProps) {
  const doctorLabel = doctorHeaderLabel(username, doctorDisplayNameProp)
  const avatarColorSeed = nameForAvatarColor(doctorLabel)
  const doctorInitials = initialsForDoctor(doctorLabel)
  const patientName = patient ? `${patient.firstName} ${patient.lastName}`.trim() : ''

  return (
    <div className="flex h-full min-w-0 flex-col bg-background">
      <motion.header
        className="sticky top-0 z-40 shrink-0 border-b border-border/60 bg-background/80 backdrop-blur-md"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="flex h-12 w-full items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar className="size-9 shrink-0 rounded-full">
              <AvatarFallback
                className={cn('text-xs font-semibold', avatarFallbackClassForName(avatarColorSeed))}
              >
                {doctorInitials}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 truncate text-base font-bold tracking-tight text-foreground">
              {doctorLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => toast.message('No new notifications')}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground active:scale-95"
            aria-label="Notifications"
          >
            <Bell className="size-5" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 px-4 py-2">
          <span
            className={cn(
              'shrink-0 rounded-full border border-border/70 bg-muted/40 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground/90',
            )}
          >
            {clinicSiteLabel}
          </span>
          <span
            className={cn(
              'shrink-0 rounded-full bg-primary/30 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-foreground',
            )}
          >
            {providerSpecialty}
          </span>
        </div>
      </motion.header>

      {patient && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: [0.25, 0.1, 0.25, 1] }}
        >
          <PatientBanner
            name={patientName}
            dob={patient.dateOfBirth}
            gender={patient.gender}
            onDismiss={onClearSelectedPatient}
          />
        </motion.div>
      )}

      <ScrollArea className="min-h-0 min-w-0 flex-1">
        <motion.div
          className="min-w-0 space-y-6 px-4 pb-24 pt-4"
          variants={homePageListVariants}
          initial="hidden"
          animate="show"
        >
          <motion.section variants={homePageItemVariants} className="space-y-4">
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
          </motion.section>

          <motion.section variants={homePageItemVariants} className="space-y-4">
            <h2 className="text-lg font-bold text-foreground">Recent encounters</h2>
            <div className="space-y-3">
              {encounters.map((encounter) => {
                const patientLabel = `Patient ${shortPatientId(encounter.patientId)}`
                return (
                <div
                  key={encounter.id}
                  className="flex w-full cursor-pointer items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
                  onClick={() => onOpenEncounter(encounter.id)}
                  role="presentation"
                >
                  <Avatar className="size-12 shrink-0 rounded-full">
                    <AvatarFallback
                      className={cn('text-xs font-semibold', avatarFallbackClassForName(patientLabel))}
                    >
                      {shortPatientId(encounter.patientId).slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      {onOpenEncounterPatient ? (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 cursor-pointer items-baseline gap-0 overflow-hidden rounded-sm border-0 bg-transparent p-0 text-left font-bold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={(ev) => {
                            ev.stopPropagation()
                            onOpenEncounterPatient(encounter.id)
                          }}
                          aria-label={`View demographics for ${patientLabel}`}
                        >
                          <span className="min-w-0 flex-1 truncate font-bold text-foreground underline-offset-4 decoration-2 decoration-foreground hover:font-extrabold hover:underline">
                            {patientLabel}
                          </span>
                        </button>
                      ) : (
                        <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                          {patientLabel}
                        </span>
                      )}
                      <p className="shrink-0 pl-2 text-right text-[11px] font-semibold leading-snug text-muted-foreground whitespace-nowrap">
                        {formatEncounterTime(encounter.encounterTime)}
                      </p>
                    </div>
                    <p className="mt-0.5 text-xs font-medium text-muted-foreground">
                      {encounter.careSetting}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <span
                        className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase text-secondary-foreground"
                      >
                        {encounter.status}
                      </span>
                    </div>
                  </div>
                </div>
                )
              })}
              {encounters.length === 0 && (
                <p className="rounded-lg border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
                  No encounters available for today yet.
                </p>
              )}
            </div>
          </motion.section>

          <motion.section
            variants={homePageItemVariants}
            className="relative overflow-hidden rounded-lg bg-slate-900 p-6 text-white dark:bg-zinc-950"
          >
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
          </motion.section>
        </motion.div>
      </ScrollArea>
    </div>
  )
}
