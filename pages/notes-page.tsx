import * as React from 'react'
import { EncounterCodeBadges } from '@/components/encounter-code-badges'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FileText, Search } from 'lucide-react'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'
import type { Encounter } from '@/lib/mock-encounters'
import { formatEncounterDob, MOCK_ENCOUNTERS } from '@/lib/mock-encounters'
import { cn } from '@/lib/utils'

interface NotesPageProps {
  patientId?: string
  /** Opens AI EMR when user taps an encounter (demo). */
  onOpenEncounter?: () => void
}

function encounterMatchesQuery(e: Encounter, raw: string): boolean {
  const q = raw.trim().toLowerCase()
  if (!q) return true
  if (e.name.toLowerCase().includes(q)) return true
  if (e.gender.toLowerCase().includes(q)) return true
  const dobFmt = formatEncounterDob(e.dob).toLowerCase()
  if (dobFmt.includes(q)) return true
  if (e.dob.toLowerCase().includes(q)) return true
  const digits = q.replace(/\D/g, '')
  if (digits.length >= 2) {
    const dobDigits = e.dob.replace(/\D/g, '')
    if (dobDigits.includes(digits)) return true
    if (dobFmt.replace(/\D/g, '').includes(digits)) return true
  }
  const codeHit = (codes: string[]) =>
    codes.some((c) => {
      const n = c.toLowerCase()
      return n.includes(q) || n.replace(/\./g, '').includes(q.replace(/\./g, ''))
    })
  if (codeHit(e.icdCodes)) return true
  if (codeHit(e.cptCodes)) return true
  return false
}

export function NotesPage({ patientId: _patientId, onOpenEncounter }: NotesPageProps) {
  const [searchQuery, setSearchQuery] = React.useState('')

  const filteredEncounters = React.useMemo(
    () => MOCK_ENCOUNTERS.filter((e) => encounterMatchesQuery(e, searchQuery)),
    [searchQuery],
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 py-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by name, DOB, or ICD/CPT…"
            className="h-10 bg-background pl-9"
            aria-label="Search encounters by patient name, date of birth, or billing codes"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 px-4 py-3 pb-6">
          <h2 className="text-lg font-bold text-foreground">Encounters</h2>
          {filteredEncounters.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-muted-foreground">
              <FileText className="h-8 w-8" />
              <p className="text-center text-sm">No encounters match your search.</p>
            </div>
          )}
          {filteredEncounters.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onOpenEncounter?.()}
              className={cn(
                'flex w-full items-center gap-4 rounded-lg border border-border/60 bg-card p-4 text-left transition-colors hover:bg-muted/40 active:scale-[0.99]',
                e.muted && 'opacity-80',
              )}
              aria-label={`Open encounter for ${e.name}, DOB ${formatEncounterDob(e.dob)}, ${e.gender}, ${e.when}`}
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
      </ScrollArea>
    </div>
  )
}
