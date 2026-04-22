import { differenceInYears, format, isValid, parseISO } from 'date-fns'
import { FileText } from 'lucide-react'
import { motion, type Variants } from 'motion/react'
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

function formatAgeFromDob(iso: string): string | null {
  const d = parseISO(iso)
  if (!isValid(d)) return null
  const years = differenceInYears(new Date(), d)
  return Number.isFinite(years) && years >= 0 ? `${years}y` : null
}

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

function shortPatientLabel(patientId: string | null | undefined): string {
  const normalized = patientId?.trim()
  if (!normalized) return 'Unknown patient'
  return `Patient ${normalized.slice(0, 8)}`
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
                  return (
                    <motion.li
                      key={`${line.speaker}-${index}`}
                      variants={transcriptLineVariants}
                      className={`flex ${isDoctor ? 'justify-end' : 'justify-start'}`}
                    >
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
