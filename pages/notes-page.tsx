import * as React from 'react'
import { format } from 'date-fns'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { CalendarIcon, FileText, Filter, Search, X } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { EncounterSummary } from '@/lib/encounter-api'
import { cn } from '@/lib/utils'
import { EncounterStatusBadge } from '@/components/encounter/encounter-status-badge'
import { EncounterSourceBadge } from '@/components/encounter/encounter-source-badge'

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
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  page: number
  hasMore: boolean
  onPrevPage: () => void
  onNextPage: () => void
  startDate: string
  endDate: string
  onApplyFilter: (start: string, end: string) => void
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

function encounterPatientName(encounter: EncounterSummary): string {
  const first = encounter.patientFirstName?.trim() ?? ''
  const last = encounter.patientLastName?.trim() ?? ''
  const full = `${first} ${last}`.trim()
  if (full) return full
  return `Patient ${shortPatientId(encounter.patientId)}`
}

function encounterPatientMeta(encounter: EncounterSummary): string {
  const dob = encounter.patientDateOfBirth ? `DOB: ${formatDobDisplay(encounter.patientDateOfBirth)}` : null
  const age = encounter.patientDateOfBirth ? ageFromDob(encounter.patientDateOfBirth) : null
  const gender = encounter.patientGender?.trim() || null
  return [dob, age, gender].filter(Boolean).join(' · ')
}

function encounterPatientIdLabel(encounter: EncounterSummary): string {
  const displayId = encounter.patientDisplayId?.trim()
  if (displayId) return `Patient ID: ${displayId}`
  return `Patient ID: ${shortPatientId(encounter.patientId)}`
}

function formatEncounterTime(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return timestamp
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date)
}

function parseLocalDate(s: string): Date | undefined {
  if (!s) return undefined
  const parts = s.split('-').map(Number)
  if (parts.length !== 3 || parts.some((n) => !n)) return undefined
  return new Date(parts[0]!, parts[1]! - 1, parts[2]!)
}

function formatDateLabel(value: string): string {
  const date = parseLocalDate(value)
  return date ? format(date, 'MMM d, yyyy') : value
}

function formatDateRangeLabel(start: string, end: string): string {
  if (start && end) return `${formatDateLabel(start)} - ${formatDateLabel(end)}`
  if (start) return `From ${formatDateLabel(start)}`
  if (end) return `Until ${formatDateLabel(end)}`
  return ''
}

export function NotesPage({
  patientId: _patientId,
  encounters,
  searchQuery,
  onSearchQueryChange,
  page,
  hasMore,
  onPrevPage,
  onNextPage,
  startDate,
  endDate,
  onApplyFilter,
  onOpenEncounter,
  onOpenEncounterPatient,
}: NotesPageProps) {
  const [filterOpen, setFilterOpen] = React.useState(false)
  const [openCalendar, setOpenCalendar] = React.useState<'start' | 'end' | null>(null)
  const [localStart, setLocalStart] = React.useState(startDate)
  const [localEnd, setLocalEnd] = React.useState(endDate)
  const [filterError, setFilterError] = React.useState('')

  React.useEffect(() => {
    setLocalStart(startDate)
    setLocalEnd(endDate)
  }, [startDate, endDate])

  function handleApplyFilter() {
    if (localStart && localEnd && localStart > localEnd) {
      setFilterError('Start date must be on or before end date.')
      return
    }
    setFilterError('')
    onApplyFilter(localStart, localEnd)
    setFilterOpen(false)
    setOpenCalendar(null)
  }

  function handleClearFilter() {
    setLocalStart('')
    setLocalEnd('')
    setFilterError('')
    onApplyFilter('', '')
    setFilterOpen(false)
    setOpenCalendar(null)
  }

  const appliedDateRangeLabel = formatDateRangeLabel(startDate, endDate)
  const draftDateRangeLabel = formatDateRangeLabel(localStart, localEnd)
  const hasActiveFilter = appliedDateRangeLabel !== ''

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
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="Search encounters by name, DOB (MM/DD/YYYY), MRN, UUID, or Patient ID…"
            className={cn(
              'h-9 rounded-md border border-border/50 bg-muted/25 pl-9 shadow-none',
              'transition-colors focus-visible:border-border focus-visible:ring-1 focus-visible:ring-ring',
            )}
            aria-label="Search encounters by name, DOB, MRN, UUID, or patient ID"
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
          <motion.div variants={notesPageItemVariants} className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">History</h2>
            <Popover
              open={filterOpen}
              onOpenChange={(open) => {
                setFilterOpen(open)
                setOpenCalendar(null)
                setFilterError('')
                if (open) {
                  setLocalStart(startDate)
                  setLocalEnd(endDate)
                }
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className={cn(
                    'h-7 gap-1.5 px-2 text-xs text-foreground shadow-none',
                    hasActiveFilter && 'border-border/70 bg-muted/35',
                  )}
                  aria-label="Filter encounters by date range"
                >
                  <Filter className="size-3.5" aria-hidden />
                  {!hasActiveFilter && <span>Filter</span>}
                  {appliedDateRangeLabel && (
                    <span className="max-w-[132px] truncate text-[11px] font-normal">
                      {appliedDateRangeLabel}
                    </span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-3" align="end">
                <div className="space-y-3">
                  <div className="space-y-0.5">
                    <p className="text-sm font-semibold">Date range</p>
                    {draftDateRangeLabel && (
                      <p className="max-w-[260px] truncate text-xs text-muted-foreground">
                        {draftDateRangeLabel}
                      </p>
                    )}
                  </div>

                  {/* Start date */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">Start date</p>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start gap-2 text-left text-xs font-normal shadow-none h-8',
                        !localStart && 'text-muted-foreground',
                      )}
                      onClick={() => setOpenCalendar(openCalendar === 'start' ? null : 'start')}
                    >
                      <CalendarIcon className="size-3.5 shrink-0" aria-hidden />
                      {localStart ? formatDateLabel(localStart) : 'Pick a date'}
                    </Button>
                    {openCalendar === 'start' && (
                      <div className="rounded-md border">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          fromYear={2020}
                          toYear={new Date().getFullYear()}
                          selected={parseLocalDate(localStart)}
                          onSelect={(date) => {
                            setLocalStart(date ? format(date, 'yyyy-MM-dd') : '')
                            setOpenCalendar(null)
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* End date */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">End date</p>
                    <Button
                      type="button"
                      variant="outline"
                      className={cn(
                        'w-full justify-start gap-2 text-left text-xs font-normal shadow-none h-8',
                        !localEnd && 'text-muted-foreground',
                      )}
                      onClick={() => setOpenCalendar(openCalendar === 'end' ? null : 'end')}
                    >
                      <CalendarIcon className="size-3.5 shrink-0" aria-hidden />
                      {localEnd ? formatDateLabel(localEnd) : 'Pick a date'}
                    </Button>
                    {openCalendar === 'end' && (
                      <div className="rounded-md border">
                        <Calendar
                          mode="single"
                          captionLayout="dropdown"
                          fromYear={2020}
                          toYear={new Date().getFullYear()}
                          selected={parseLocalDate(localEnd)}
                          onSelect={(date) => {
                            setLocalEnd(date ? format(date, 'yyyy-MM-dd') : '')
                            setOpenCalendar(null)
                          }}
                        />
                      </div>
                    )}
                  </div>

                  {/* Validation error */}
                  {filterError && (
                    <p className="text-xs text-destructive">{filterError}</p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      className="h-7 flex-1 text-xs"
                      onClick={handleApplyFilter}
                    >
                      Apply
                    </Button>
                    {(localStart || localEnd || hasActiveFilter) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 px-2 text-xs shadow-none"
                        onClick={handleClearFilter}
                      >
                        <X className="size-3" aria-hidden />
                        Clear
                      </Button>
                    )}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </motion.div>
          {encounters.length === 0 && (
            <motion.div
              variants={notesPageItemVariants}
              className="flex flex-col items-center gap-2 py-12 text-muted-foreground"
            >
              <FileText className="h-8 w-8" />
              <p className="text-center text-sm">
                {searchQuery.trim() || hasActiveFilter
                  ? 'No encounters match your search or filter.'
                  : 'No encounters found.'}
              </p>
            </motion.div>
          )}
          {encounters.map((encounter) => {
            const patientNameLabel = encounterPatientName(encounter)
            const patientMetaLine = encounterPatientMeta(encounter)
            const patientIdLine = encounterPatientIdLabel(encounter)
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
                  className={cn('text-xs font-semibold', avatarFallbackClassForName(patientNameLabel))}
                >
                  {initialsFromDisplayName(patientNameLabel)}
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
                      aria-label={`View demographics for ${patientNameLabel}`}
                    >
                      <span className="min-w-0 flex-1 truncate font-bold text-foreground underline-offset-4 decoration-2 decoration-foreground hover:font-extrabold hover:underline">
                        {patientNameLabel}
                      </span>
                    </button>
                  ) : (
                    <span className="min-w-0 flex-1 truncate font-bold text-foreground">
                      {patientNameLabel}
                    </span>
                  )}
                  <p className="shrink-0 pl-2 text-right text-[11px] font-semibold leading-snug text-muted-foreground whitespace-nowrap">
                    {formatEncounterTime(encounter.encounterTime)}
                  </p>
                </div>
                {patientMetaLine ? (
                  <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                    {patientMetaLine}
                  </p>
                ) : null}
                <p className="mt-0.5 truncate text-xs font-medium text-muted-foreground">
                  {patientIdLine}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <EncounterStatusBadge status={encounter.status} />
                  <EncounterSourceBadge source={encounter.emrSource} />
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
