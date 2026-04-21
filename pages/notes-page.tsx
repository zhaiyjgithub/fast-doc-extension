import * as React from 'react'
import { Input } from '@/components/ui/input'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FileText, Search } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { EncounterSummary } from '@/lib/encounter-api'
import { cn } from '@/lib/utils'

/** Aligned with `soap-page.tsx` / patient demographic list motion. */
const notesPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const notesPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

interface NotesPageProps {
  patientId?: string
  encounters: EncounterSummary[]
  page: number
  hasMore: boolean
  onPrevPage: () => void
  onNextPage: () => void
  /** Opens AI EMR when user taps an encounter. */
  onOpenEncounter?: (encounterId: string) => void
  /** Opens patient demographics when user taps the patient name row. */
  onOpenEncounterPatient?: (encounterId: string) => void
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

function encounterMatchesQuery(encounter: EncounterSummary, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  const patientLabel = `patient ${shortPatientId(encounter.patientId)}`.toLowerCase()
  if (patientLabel.includes(q)) return true
  if (encounter.patientId.toLowerCase().includes(q)) return true
  if (encounter.status.toLowerCase().includes(q)) return true
  if (encounter.careSetting.toLowerCase().includes(q)) return true
  if (formatEncounterTime(encounter.encounterTime).toLowerCase().includes(q)) return true
  return encounter.encounterTime.toLowerCase().includes(q)
}

export function NotesPage({
  patientId: _patientId,
  encounters,
  page,
  hasMore,
  onPrevPage,
  onNextPage,
  onOpenEncounter,
  onOpenEncounterPatient,
}: NotesPageProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredEncounters = React.useMemo(
    () => encounters.filter((encounter) => encounterMatchesQuery(encounter, searchQuery)),
    [encounters, searchQuery],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <motion.div
        className="shrink-0 border-b border-border/60 bg-background px-4 py-2.5"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
      >
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground/80"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by patient ID, status, or care setting…"
            className={cn(
              'h-9 rounded-md border border-border/50 bg-muted/25 pl-9 shadow-none',
              'transition-colors focus-visible:border-border focus-visible:ring-1 focus-visible:ring-ring',
            )}
            aria-label="Search encounters by patient ID, status, care setting, or encounter time"
          />
        </div>
      </motion.div>

      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          className="space-y-3 px-4 py-3 pb-6"
          variants={notesPageListVariants}
          initial="hidden"
          animate="show"
        >
          <motion.h2 variants={notesPageItemVariants} className="text-lg font-bold text-foreground">
            Encounters
          </motion.h2>
          {filteredEncounters.length === 0 && (
            <motion.div
              variants={notesPageItemVariants}
              className="flex flex-col items-center gap-2 py-12 text-muted-foreground"
            >
              <FileText className="h-8 w-8" />
              <p className="text-center text-sm">No encounters match your search.</p>
            </motion.div>
          )}
          {filteredEncounters.map((encounter) => {
            const patientLabel = `Patient ${shortPatientId(encounter.patientId)}`
            return (
            <motion.div
              key={encounter.id}
              variants={notesPageItemVariants}
              layout
              className="flex w-full cursor-pointer items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]"
              onClick={() => onOpenEncounter?.(encounter.id)}
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
            </motion.div>
            )
          })}
          <motion.div variants={notesPageItemVariants} className="pt-2">
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(event) => {
                      event.preventDefault()
                      if (page <= 1) return
                      onPrevPage()
                    }}
                    className={cn(page <= 1 && 'pointer-events-none opacity-50')}
                  />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive onClick={(event) => event.preventDefault()}>
                    {page}
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(event) => {
                      event.preventDefault()
                      if (!hasMore) return
                      onNextPage()
                    }}
                    className={cn(!hasMore && 'pointer-events-none opacity-50')}
                  />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </motion.div>
        </motion.div>
      </ScrollArea>
    </div>
  )
}
