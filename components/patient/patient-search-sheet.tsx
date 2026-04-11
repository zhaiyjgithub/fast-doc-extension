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
import { Search, ChevronRight, X, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export interface Patient {
  id: string
  name: string
  dob: string
  gender?: 'Male' | 'Female' | 'Other'
  idNumber?: string
}

interface PatientSearchSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (patient: Patient) => void
}

const MOCK_PATIENTS: Patient[] = [
  { id: '1', name: 'James Wilson', dob: '1985-03-12', gender: 'Male', idNumber: 'MRN-100842' },
  { id: '2', name: 'Sarah Chen', dob: '1992-07-25', gender: 'Female', idNumber: 'MRN-100903' },
  { id: '3', name: 'Emily Rodriguez', dob: '1978-11-03', gender: 'Female', idNumber: 'MRN-100721' },
  { id: '4', name: 'Michael Torres', dob: '2001-01-18', gender: 'Male', idNumber: 'MRN-101012' },
  { id: '5', name: 'Lisa Park', dob: '1965-09-30', gender: 'Female', idNumber: 'MRN-100655' },
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
    const dobFmt = formatDobDisplay(p.dob).toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.idNumber ?? '').toLowerCase().includes(q) ||
      p.dob.toLowerCase().includes(q) ||
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
            <div className="space-y-4 px-6 pb-32">
              <p className="px-1 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                Recent searches
              </p>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-[88px] rounded-lg" />
                  ))
                : filtered.map((patient, index) => {
                    const ini = initialsFromName(patient.name)
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
                            {patient.name}
                          </h3>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span>{patient.idNumber ?? '—'}</span>
                            <span
                              className="size-1 shrink-0 rounded-full bg-border"
                              aria-hidden
                            />
                            <span>DOB: {formatDobDisplay(patient.dob)}</span>
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

          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-card via-card to-transparent" />
          <div className="absolute inset-x-0 bottom-0 p-6">
            <button
              type="button"
              onClick={() => toast.message('Add new patient is not available yet')}
              className="pointer-events-auto flex w-full items-center justify-center gap-2 rounded-full border-2 border-primary py-4 px-6 font-bold text-primary transition-all hover:bg-primary/5 active:scale-[0.98]"
            >
              <Plus className="size-5" aria-hidden />
              Add new patient
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
