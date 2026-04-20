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
}

const MOCK_PATIENTS: Patient[] = [
  {
    id: '1',
    mrn: 'MRN-100842',
    firstName: 'James',
    lastName: 'Wilson',
    dateOfBirth: '1985-03-12',
    gender: 'Male',
    isActive: true,
  },
  {
    id: '2',
    mrn: 'MRN-100903',
    firstName: 'Sarah',
    lastName: 'Chen',
    dateOfBirth: '1992-07-25',
    gender: 'Female',
    isActive: true,
  },
  {
    id: '3',
    mrn: 'MRN-100721',
    firstName: 'Emily',
    lastName: 'Rodriguez',
    dateOfBirth: '1978-11-03',
    gender: 'Female',
    isActive: true,
  },
  {
    id: '4',
    mrn: 'MRN-101012',
    firstName: 'Michael',
    lastName: 'Torres',
    dateOfBirth: '2001-01-18',
    gender: 'Male',
    isActive: true,
  },
  {
    id: '5',
    mrn: 'MRN-100655',
    firstName: 'Lisa',
    lastName: 'Park',
    dateOfBirth: '1965-09-30',
    gender: 'Female',
    isActive: true,
  },
]

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

export function PatientSearchSheet({
  open,
  onOpenChange,
  onSelect,
}: PatientSearchSheetProps) {
  const [query, setQuery] = React.useState('')
  const [isLoading] = React.useState(false)

  const q = query.trim().toLowerCase()
  const filtered = MOCK_PATIENTS.filter((p) => {
    if (!q) return true
    const name = displayName(p).toLowerCase()
    const dobFmt = formatDobDisplay(p.dateOfBirth).toLowerCase()
    return (
      name.includes(q) ||
      (p.mrn ?? '').toLowerCase().includes(q) ||
      (p.clinicPatientId ?? '').toLowerCase().includes(q) ||
      p.dateOfBirth.toLowerCase().includes(q) ||
      dobFmt.includes(q)
    )
  })

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
              placeholder="Search name, MRN, or DOB…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
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
                Recent searches
              </p>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-lg" />
                  ))
                : filtered.map((patient, index) => {
                    const name = displayName(patient)
                    const ini = initialsFromName(name)
                    const style = AVATAR_STYLES[index % AVATAR_STYLES.length]
                    const mutedAvatar = patient.id === '4'
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
                            mutedAvatar && 'opacity-70',
                          )}
                        >
                          {ini}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-bold text-foreground transition-colors group-hover:text-primary">
                            {name}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{patient.clinicPatientId ?? patient.mrn ?? '—'}</span>
                            <span
                              className="size-1 shrink-0 rounded-full bg-border"
                              aria-hidden
                            />
                            <span>DOB: {formatDobDisplay(patient.dateOfBirth)}</span>
                          </div>
                        </div>
                        <ChevronRight
                          className="size-5 shrink-0 text-muted-foreground/70"
                          aria-hidden
                        />
                      </button>
                    )
                  })}
              {!isLoading && filtered.length === 0 && (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  No patients found
                </p>
              )}
            </div>
          </ScrollArea>
        </div>
      </SheetContent>
    </Sheet>
  )
}
