import { format, isValid, parseISO } from 'date-fns'
import { FileText } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Patient } from '@/components/patient/patient-search-sheet'
import type { EncounterSummary } from '@/lib/encounter-api'

interface TranscriptPageProps {
  patient?: Patient | null
  encounter?: EncounterSummary | null
}

function formatDob(iso: string) {
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'MM/dd/yyyy')
}

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

function shortPatientLabel(patientId: string | null | undefined): string {
  const normalized = patientId?.trim()
  if (!normalized) return 'Unknown patient'
  return `Patient ${normalized.slice(0, 8)}`
}

export function TranscriptPage({ patient, encounter }: TranscriptPageProps) {
  const transcriptText = encounter?.transcriptText?.trim() ?? ''

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 px-4 pb-6 pt-4">
          <section className="rounded-lg bg-primary/20 p-4 shadow-sm ring-1 ring-primary/15">
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
              Encounter transcript
            </p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">
              {patient ? patientDisplayName(patient) : shortPatientLabel(encounter?.patientId)}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {patient
                ? `DOB: ${formatDob(patient.dateOfBirth)}${
                    patient.clinicPatientId
                      ? ` • Patient ID ${patient.clinicPatientId}`
                      : patient.mrn
                        ? ` • ${patient.mrn}`
                        : ''
                  }`
                : `Encounter ID ${encounter?.id ?? '-'}`}
            </p>
          </section>

          <section className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
            </div>
            {transcriptText ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{transcriptText}</p>
            ) : (
              <p className="rounded-lg border border-dashed border-border/70 bg-muted/25 px-3 py-4 text-sm text-muted-foreground">
                No transcript is available for this encounter yet. Generate or attach a transcript to
                view it here.
              </p>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}
