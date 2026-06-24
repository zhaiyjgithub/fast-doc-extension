import { differenceInYears, format, isValid, parseISO } from 'date-fns'
import { FileText } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { Patient } from '@/components/patient/patient-search-sheet'
import type { EncounterSummary } from '@/lib/encounter-api'
import { cn } from '@/lib/utils'

interface TranscriptPageProps {
  patient?: Patient | null
  encounter?: EncounterSummary | null
}

function formatDob(iso: string) {
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'MM/dd/yyyy')
}

function formatAgeFromDob(iso: string): string | null {
  const d = parseISO(iso)
  if (!isValid(d)) return null
  const years = differenceInYears(new Date(), d)
  return Number.isFinite(years) && years >= 0 ? `${years}y` : null
}

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

function encounterPatientDisplayName(encounter: EncounterSummary | null | undefined): string {
  const first = encounter?.patientFirstName?.trim() ?? ''
  const last = encounter?.patientLastName?.trim() ?? ''
  return `${first} ${last}`.trim()
}

function shortPatientLabel(patientId: string | null | undefined): string {
  const normalized = patientId?.trim()
  if (!normalized) return 'Unknown patient'
  return `Patient ${normalized.slice(0, 8)}`
}

function initialsFromDisplayName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase() || '?'
  }
  const one = parts[0] ?? name.trim()
  if (one.length >= 2) return one.slice(0, 2).toUpperCase()
  return (one[0] ?? '?').toUpperCase()
}

type TranscriptLine = {
  speaker: string
  text: string
}

const transcriptPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

const transcriptPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: [0.25, 0.1, 0.25, 1] },
  },
}

const transcriptLineVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' } },
}

function parseTranscriptLines(transcriptText: string): TranscriptLine[] {
  const lines = transcriptText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const parsed: TranscriptLine[] = []
  for (const line of lines) {
    const m = line.match(/^([^:]{1,24}):\s*(.+)$/)
    if (m) {
      parsed.push({ speaker: m[1].trim(), text: m[2].trim() })
    } else {
      parsed.push({ speaker: 'Narrative', text: line })
    }
  }
  return parsed
}

export function TranscriptPage({ patient, encounter }: TranscriptPageProps) {
  const transcriptText = encounter?.transcriptText?.trim() ?? ''
  const transcriptLines = parseTranscriptLines(transcriptText)
  const patientName =
    patient ? patientDisplayName(patient) : encounterPatientDisplayName(encounter) || shortPatientLabel(encounter?.patientId)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          className="space-y-4 px-4 pb-6 pt-4"
          variants={transcriptPageListVariants}
          initial="hidden"
          animate="show"
        >
          <motion.section
            variants={transcriptPageItemVariants}
            className="rounded-lg bg-primary/20 p-4 shadow-sm ring-1 ring-primary/15"
          >
            <p className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
              Encounter transcript
            </p>
            <h2 className="mt-1 text-lg font-extrabold text-foreground">
              {patient ? patientDisplayName(patient) : shortPatientLabel(encounter?.patientId)}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {patient ? (
                <>
                  {`DOB: ${formatDob(patient.dateOfBirth)}`}
                  {formatAgeFromDob(patient.dateOfBirth) ? ` • ${formatAgeFromDob(patient.dateOfBirth)}` : ''}
                  {patient.gender ? ` • ${patient.gender}` : ''}
                  {patient.clinicPatientId
                    ? ` • Patient ID ${patient.clinicPatientId}`
                    : patient.mrn
                      ? ` • ${patient.mrn}`
                      : ''}
                </>
              ) : (
                `Encounter ID ${encounter?.id ?? '-'}`
              )}
            </p>
          </motion.section>

          <motion.section
            variants={transcriptPageItemVariants}
            className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
          >
            <div className="mb-2 flex items-center gap-2">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Transcript</h3>
            </div>
            {transcriptText ? (
              <motion.ul className="space-y-2" variants={transcriptPageListVariants}>
                {transcriptLines.map((line, index) => {
                  const normalizedSpeaker = line.speaker.toLowerCase()
                  const isDoctor = normalizedSpeaker === 'doctor'
                  const isPatient = normalizedSpeaker === 'patient'
                  const avatarName = isPatient ? patientName : isDoctor ? 'Doctor' : line.speaker
                  const avatarInitials = isDoctor ? 'DR' : initialsFromDisplayName(avatarName)
                  const avatarClass = isDoctor
                    ? 'bg-muted text-foreground ring-1 ring-border/60'
                    : isPatient
                      ? 'bg-primary/15 text-primary ring-1 ring-primary/20'
                      : 'bg-card text-foreground ring-1 ring-border/60'
                  return (
                    <motion.li
                      key={`${line.speaker}-${index}`}
                      variants={transcriptLineVariants}
                      className={cn('flex items-end gap-2', isDoctor && 'justify-end')}
                    >
                      {!isDoctor ? (
                        <Avatar className="size-8 shrink-0 rounded-full">
                          <AvatarFallback
                            className={cn('text-[10px] font-semibold', avatarClass)}
                          >
                            {avatarInitials}
                          </AvatarFallback>
                        </Avatar>
                      ) : null}
                      <div
                        className={`max-w-[88%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                          isDoctor
                            ? 'bg-muted/55 text-foreground'
                            : isPatient
                              ? 'bg-primary/10 text-foreground'
                              : 'bg-card text-foreground'
                        }`}
                      >
                        <p className="mb-0.5 text-xs font-bold uppercase tracking-wide text-foreground/80">
                          {line.speaker}
                        </p>
                        <p className="whitespace-pre-wrap">{line.text}</p>
                      </div>
                      {isDoctor ? (
                        <Avatar className="size-8 shrink-0 rounded-full">
                          <AvatarFallback
                            className={cn('text-[10px] font-semibold', avatarClass)}
                          >
                            {avatarInitials}
                          </AvatarFallback>
                        </Avatar>
                      ) : null}
                    </motion.li>
                  )
                })}
              </motion.ul>
            ) : (
              <p className="rounded-lg border border-dashed border-border/70 bg-muted/25 px-3 py-4 text-sm text-muted-foreground">
                No transcript is available for this encounter yet. Generate or attach a transcript to
                view it here.
              </p>
            )}
          </motion.section>
        </motion.div>
      </ScrollArea>
    </div>
  )
}
