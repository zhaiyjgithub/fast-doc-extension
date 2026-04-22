import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
} from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { Search, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { searchPatients } from '@/lib/patient-api'

export interface Patient {
  id: string
  mrn?: string
  createdBy?: string | null
  clinicPatientId?: string | null
  clinicId?: string | null
  divisionId?: string | null
  clinicSystem?: string | null
  clinicName?: string | null
  firstName: string
  lastName: string
  dateOfBirth: string
  gender?: 'Male' | 'Female' | 'Other'
  primaryLanguage?: string | null
  isActive?: boolean
  demographics?: {
    phone?: string | null
    email?: string | null
    addressLine1?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
    country?: string | null
  } | null
}

interface PatientSearchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (patient: Patient) => void
  accessToken?: string | null
}

const AVATAR_STYLES = [
  'bg-primary text-primary-foreground',
  'bg-secondary text-secondary-foreground',
  'bg-muted text-muted-foreground',
] as const

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return (a + b).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

function formatDobDisplay(iso: string): string {
  const d = parseISO(iso)
  return isValid(d) ? format(d, 'MM/dd/yyyy') : iso
}

function displayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

const SEARCH_DEBOUNCE_MS = 350
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MM_DD_YYYY_RE = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})$/
const YYYY_MM_DD_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

function normalizeDobForApi(raw: string): string | null {
  const v = raw.trim()
  const slashMatch = MM_DD_YYYY_RE.exec(v)
  if (slashMatch) {
    const month = slashMatch[1].padStart(2, '0')
    const day = slashMatch[2].padStart(2, '0')
    const year = slashMatch[3]
    return `${year}-${month}-${day}`
  }
  if (YYYY_MM_DD_RE.test(v)) {
    return v
  }
  return null
}

function buildSearchOptionsFromQuery(raw: string): {
  q?: string
  dob?: string
  patientId?: string
  clinicPatientId?: string
} {
  const query = raw.trim()
  if (!query) {
    return {}
  }

  const prefixed = query.match(/^(clinic\s*patient\s*id|patient\s*id|cpid)\s*:\s*(.+)$/i)
  if (prefixed && prefixed[2]?.trim()) {
    return { clinicPatientId: prefixed[2].trim() }
  }

  if (UUID_RE.test(query)) {
    return { patientId: query }
  }

  const normalizedDob = normalizeDobForApi(query)
  if (normalizedDob) {
    return { dob: normalizedDob }
  }

  // For compact identifiers containing digits and no spaces, prefer clinic patient ID search.
  if (!query.includes(' ') && /\d/.test(query)) {
    return { clinicPatientId: query }
  }

  return { q: query }
}

export function PatientSearchSheet({
  open,
  onOpenChange,
  onSelect,
  accessToken,
}: PatientSearchSheetProps) {
  const [query, setQuery] = React.useState('')
  const [patients, setPatients] = React.useState<Patient[]>([])
  const [isLoading, setIsLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const abortRef = React.useRef<AbortController | null>(null)

  // Reset state when sheet closes
  React.useEffect(() => {
    if (!open) {
      setQuery('')
      setPatients([])
      setError(null)
    }
  }, [open])

  // Debounced search: fetch whenever query or open state changes
  React.useEffect(() => {
    if (!open || !accessToken) return

    const token = accessToken.trim()
    if (!token) return

    // Cancel any in-flight request
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const timerId = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      try {
        const smartOptions = buildSearchOptionsFromQuery(query)
        const result = await searchPatients(token, smartOptions)
        if (!controller.signal.aborted) {
          setPatients(result.items)
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'Failed to load patients.')
          setPatients([])
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false)
        }
      }
    }, query.trim() ? SEARCH_DEBOUNCE_MS : 0)

    return () => {
      clearTimeout(timerId)
      controller.abort()
    }
  }, [open, query, accessToken])

  const filtered = patients

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideClose
        overlayClassName="bg-foreground/40 backdrop-blur-[2px]"
        className={cn(
          'flex h-[80vh] max-h-[720px] flex-col gap-0 rounded-t-[2.5rem] border-0 border-t-0 bg-card p-0',
          'shadow-[0_-8px_40px_rgba(0,0,0,0.12)] sm:max-w-full',
        )}
      >
        <div className="flex shrink-0 justify-center pb-2 pt-4">
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/25" aria-hidden />
        </div>

        <div className="flex shrink-0 items-center justify-between px-6 py-4">
          <SheetTitle className="text-left text-2xl font-extrabold tracking-tight text-foreground">
            Find patient
          </SheetTitle>
          <SheetClose asChild>
            <button
              type="button"
              className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </SheetClose>
        </div>

        <div className="shrink-0 px-6 pb-6">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-muted-foreground">
              <Search className="size-5" aria-hidden />
            </div>
            <Input
              placeholder="Search by name, DOB (MM/DD/YYYY), UUID, or Patient ID (cpid:1234)"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              aria-label="Search patients by name, DOB, UUID, or patient ID"
              className={cn(
                'h-auto rounded-2xl border-0 bg-muted py-4 pl-12 pr-4 text-base shadow-none transition-all',
                'placeholder:text-muted-foreground/70 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-primary',
              )}
            />
          </div>
        </div>

        <div className="relative flex min-h-0 flex-1 flex-col">
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-4 px-6 pb-8">
              <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {query.trim() ? 'Results' : 'All patients'}
              </p>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-lg" />
                  ))
                : error
                  ? (
                    <p className="py-10 text-center text-sm text-destructive">
                      {error}
                    </p>
                  )
                  : filtered.map((patient, index) => {
                    const name = displayName(patient)
                    const ini = initialsFromName(name)
                    const style = AVATAR_STYLES[index % AVATAR_STYLES.length]
                    return (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => {
                          onSelect(patient)
                          onOpenChange(false)
                        }}
                        className="group flex w-full items-center gap-4 rounded-lg bg-muted/50 p-4 text-left transition-colors hover:bg-muted"
                      >
                        <div
                          className={cn(
                            'flex size-14 shrink-0 items-center justify-center rounded-full text-lg font-bold',
                            style,
                          )}
                        >
                          {ini}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-foreground transition-colors group-hover:text-primary">
                            {name}
                          </h3>
                          <div className="mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-2">
                              <span>DOB: {formatDobDisplay(patient.dateOfBirth)}</span>
                              {patient.gender && (
                                <>
                                  <span className="size-1 shrink-0 rounded-full bg-border" aria-hidden />
                                  <span>{patient.gender}</span>
                                </>
                              )}
                            </div>
                            {(patient.clinicPatientId ?? patient.mrn) && (
                              <div>Patient ID: {patient.clinicPatientId ?? patient.mrn}</div>
                            )}
                          </div>
                        </div>
                        <ChevronRight
                          className="size-5 shrink-0 text-muted-foreground/70"
                          aria-hidden
                        />
                      </button>
                    )
                  })}
              {!isLoading && !error && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  {accessToken ? 'No patients found' : 'Sign in to search patients'}
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
