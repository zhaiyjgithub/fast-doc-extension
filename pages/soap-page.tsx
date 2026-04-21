import * as React from 'react'
import { format, parseISO, isValid } from 'date-fns'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Code2,
  Copy,
  FileText,
  RefreshCw,
  MoreHorizontal,
  Pencil,
  Sparkles,
  Zap,
} from 'lucide-react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'
import type { EncounterSummary } from '@/lib/encounter-api'
import type {
  EncounterReport,
  ReportCodeEvidence,
  ReportCodeSuggestion as ApiReportCodeSuggestion,
} from '@/lib/report-api'

interface SoapPageProps {
  patient?: Patient | null
  encounterReport?: EncounterReport | null
  encounterSummary?: EncounterSummary | null
  isGenerating?: boolean
  /** Opens patient search sheet when no patient is selected. */
  onOpenPatientPicker?: () => void
  onOpenTranscript?: () => void
  onSyncToEmr?: (payload: {
    chiefComplaintText: string
    presentIllnessText: string
    autoSave?: boolean
  }) => Promise<void> | void
}

type SectionId = 'subjective' | 'objective' | 'assessment' | 'plan'

const SECTIONS: {
  id: SectionId
  label: string
  borderClass: string
  labelClass: string
  defaultBody: string
}[] = [
  {
    id: 'subjective',
    label: 'Subjective',
    borderClass: 'border-l-blue-400',
    labelClass: 'text-blue-500',
    defaultBody:
      'Patient presents with persistent cough for 3 days. Describes it as dry and hacking, worse at night. Denies fever or chills. Reports mild fatigue but no shortness of breath. History of seasonal allergies.',
  },
  {
    id: 'objective',
    label: 'Objective',
    borderClass: 'border-l-emerald-400',
    labelClass: 'text-emerald-500',
    defaultBody:
      'Vitals: BP 122/80, HR 72, Temp 98.6F, SpO2 99% on RA. Lungs: Mild end-expiratory wheezing bilaterally. Throat: Erythema noted, no exudate. Tympanic membranes clear. Heart: RRR, no murmurs.',
  },
  {
    id: 'assessment',
    label: 'Assessment',
    borderClass: 'border-l-amber-400',
    labelClass: 'text-amber-600',
    defaultBody:
      '1. Acute Bronchitis - likely viral.\n2. Reactive Airway Disease - secondary to URI.\n3. Seasonal Allergic Rhinitis.',
  },
  {
    id: 'plan',
    label: 'Plan',
    borderClass: 'border-l-indigo-400',
    labelClass: 'text-indigo-500',
    defaultBody:
      'Prescribed Albuterol inhaler 1-2 puffs q4-6h prn cough/wheeze. Supportive care: hydration and rest. Follow up in 7 days if symptoms do not improve. Patient advised on red flags.',
  },
]

interface ReportCodeSuggestion {
  id: string
  code: string
  codeType: 'ICD' | 'CPT'
  rank: number
  condition: string | null
  description: string | null
  confidence: number | null
  rationale: string | null
  status: string
  evidence: ReportCodeEvidence[]
}

const ICD_SUGGESTIONS: ReportCodeSuggestion[] = [
  {
    id: 'htn',
    code: 'I10',
    codeType: 'ICD',
    rank: 1,
    condition: 'HTN',
    description: 'Essential (primary) hypertension',
    confidence: 0.95,
    rationale:
      'Documented as a reason for visit with elevated blood pressure readings (140s) and associated symptoms of headache/dizziness.',
    status: 'needs_review',
    evidence: [{ evidenceRoute: 'llm_icd', excerpt: 'Elevated blood pressure readings in 140s.' }],
  },
  {
    id: 'knee',
    code: 'Z96.653',
    codeType: 'ICD',
    rank: 2,
    condition: 'History of bilateral knee replacement',
    description: 'Presence of artificial knee joint, bilateral',
    confidence: 0.88,
    rationale:
      'Prior operative reports and implant documentation reviewed; relevant to surgical planning and medication counseling.',
    status: 'needs_review',
    evidence: [{ evidenceRoute: 'patient_rag', excerpt: 'Bilateral TKA present in surgical history.' }],
  },
]

const CPT_SUGGESTIONS: ReportCodeSuggestion[] = [
  {
    id: '99213',
    code: '99213',
    codeType: 'CPT',
    rank: 1,
    condition: 'Established office visit',
    description:
      'Office or other outpatient visit for the evaluation and management of an established patient; 20–29 minutes typically spent.',
    confidence: 0.88,
    rationale:
      'Acute bronchitis with prescription management and patient education; MDM and documentation support 99213 level.',
    status: 'needs_review',
    evidence: [{ evidenceRoute: 'llm_cpt', excerpt: 'Problem-focused visit with medication management.' }],
  },
  {
    id: '94640',
    code: '94640',
    codeType: 'CPT',
    rank: 2,
    condition: 'Nebulizer treatment',
    description:
      'Pressurized or nonpressurized inhalation treatment for acute airway obstruction or for diagnostic purposes.',
    confidence: 0.82,
    rationale: 'Albuterol administered via nebulizer during visit for wheeze and cough.',
    status: 'needs_review',
    evidence: [{ evidenceRoute: 'llm_cpt', excerpt: 'Inhalation therapy given during encounter.' }],
  },
]

/** Matches SOAP section cards for consistent width and chrome. */
const clinicalCodeCardClass =
  'rounded-2xl border border-border/60 border-l-4 bg-card p-4 shadow-sm'

const soapPageListVariants: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.055, delayChildren: 0.04 },
  },
}

const soapPageItemVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.25, 0.1, 0.25, 1] },
  },
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) {
    const a = parts[0]?.[0]
    const b = parts[parts.length - 1]?.[0]
    if (a && b) return (a + b).toUpperCase()
  }
  return name.slice(0, 2).toUpperCase() || '?'
}

function formatDob(iso: string) {
  const d = parseISO(iso)
  if (!isValid(d)) return iso
  return format(d, 'MM/dd/yyyy')
}

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
}

function formatSuggestionStatus(status: string): string {
  return status
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function suggestionTitle(suggestion: ReportCodeSuggestion): string {
  return suggestion.condition?.trim() || suggestion.description?.trim() || suggestion.code
}

function toViewSuggestion(
  suggestion: ApiReportCodeSuggestion,
  codeType: 'ICD' | 'CPT',
  id: string,
): ReportCodeSuggestion {
  return {
    id,
    code: suggestion.code,
    codeType,
    rank: suggestion.rank,
    condition: suggestion.condition,
    description: suggestion.description,
    confidence: suggestion.confidence,
    rationale: suggestion.rationale,
    status: suggestion.status,
    evidence: suggestion.evidence,
  }
}

const fabCopyExport = [
  { icon: Copy, label: 'Copy', action: 'copy' as const },
  { icon: RefreshCw, label: 'Sync', action: 'sync' as const },
] as const

type ClinicalCodeDetail = { row: ReportCodeSuggestion }

function ClinicalCodeCard({
  borderAccentClass,
  title,
  status,
  code,
  codeFieldLabel,
  description,
  descriptionFieldLabel,
  rationale,
  confidence,
  onOpenDetail,
}: {
  borderAccentClass: string
  title: string
  status: string
  code: string
  codeFieldLabel: string
  description: string
  descriptionFieldLabel: string
  rationale: string
  confidence?: number | null
  onOpenDetail: () => void
}) {
  function handleCopyCode(e: React.MouseEvent | React.PointerEvent) {
    e.stopPropagation()
    e.preventDefault()
    void navigator.clipboard.writeText(code).then(
      () => toast.success(`Copied ${code}`),
      () => toast.error('Could not copy'),
    )
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenDetail()
        }
      }}
      aria-haspopup="dialog"
      className={cn(
        clinicalCodeCardClass,
        borderAccentClass,
        'w-full cursor-pointer text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1 text-base font-bold leading-snug text-foreground">{title}</span>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground/50" aria-hidden />
      </div>

      <p className="mb-3 text-sm text-foreground">
        <span className="text-muted-foreground">Status: </span>
        <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
          {formatSuggestionStatus(status)}
        </span>
      </p>

      <div className="space-y-3 text-sm leading-relaxed">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-muted-foreground">{codeFieldLabel}:</span>
          <span className="font-mono font-medium text-foreground">{code}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
            aria-label={`Copy code ${code}`}
            onClick={handleCopyCode}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <Copy className="size-4" aria-hidden />
          </Button>
        </div>
        <p>
          <span className="text-muted-foreground">{descriptionFieldLabel}: </span>
          <span className="text-foreground/90">{description}</span>
        </p>
        {typeof confidence === 'number' ? (
          <p>
            <span className="text-muted-foreground">Confidence: </span>
            <span className="text-foreground/90">{Math.round(confidence * 100)}%</span>
          </p>
        ) : null}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Rationale</p>
          <p className="mt-1 line-clamp-3 text-sm text-muted-foreground">{rationale}</p>
        </div>
      </div>
    </div>
  )
}

function ClinicalCodeDetailDialog({
  detail,
  onOpenChange,
}: {
  detail: ClinicalCodeDetail | null
  onOpenChange: (open: boolean) => void
}) {
  const payload = detail
    ? {
        section: detail.row.codeType,
        title: suggestionTitle(detail.row),
        status: detail.row.status,
        code: detail.row.code,
        codeFieldLabel: `${detail.row.codeType} code`,
        description: detail.row.description?.trim() || '-',
        descriptionFieldLabel: `${detail.row.codeType} description`,
        rationale: detail.row.rationale?.trim() || '-',
        confidence: detail.row.confidence,
      }
    : null

  return (
    <Dialog open={detail != null} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="flex max-h-[min(88vh,720px)] max-w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
      >
        {payload ? (
          <>
            <DialogHeader className="shrink-0 space-y-2 border-b border-border px-5 py-4 pr-12 text-left">
              <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                {payload.section} detail
              </p>
              <DialogTitle className="text-balance text-lg font-semibold leading-snug">
                {payload.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                {payload.section} code {payload.code}. Full clinical coding rationale and description.
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="min-h-0 max-h-[min(52vh,420px)] flex-1">
              <div className="space-y-4 px-5 py-4 text-left text-sm leading-relaxed">
                <p>
                  <span className="text-muted-foreground">Status: </span>
                  <span className="inline-flex rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
                    {formatSuggestionStatus(payload.status)}
                  </span>
                </p>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground">{payload.codeFieldLabel}: </span>
                  <span className="font-mono font-medium text-foreground">{payload.code}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                    aria-label={`Copy code ${payload.code}`}
                    onClick={() => {
                      void navigator.clipboard.writeText(payload.code).then(
                        () => toast.success(`Copied ${payload.code}`),
                        () => toast.error('Could not copy'),
                      )
                    }}
                  >
                    <Copy className="size-4" aria-hidden />
                  </Button>
                </div>
                <p>
                  <span className="text-muted-foreground">{payload.descriptionFieldLabel}: </span>
                  <span className="text-foreground/90">{payload.description}</span>
                </p>
                {typeof payload.confidence === 'number' ? (
                  <p>
                    <span className="text-muted-foreground">Confidence: </span>
                    <span className="text-foreground/90">{Math.round(payload.confidence * 100)}%</span>
                  </p>
                ) : null}
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                    Rationale
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{payload.rationale}</p>
                </div>
              </div>
            </ScrollArea>

            <DialogFooter className="shrink-0 border-t border-border px-5 py-3 sm:justify-center">
              <DialogClose asChild>
                <Button type="button" variant="outline" className="w-full sm:mt-0 sm:w-auto">
                  Close
                </Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function SoapFabMenu({
  onCopy,
  onSync,
  onEdit,
  onTranscript,
}: {
  onCopy: () => void
  onSync: () => void
  onEdit: () => void
  onTranscript?: () => void
}) {
  const [open, setOpen] = React.useState(false)

  const fabActions = React.useMemo(
    () =>
      [
        ...fabCopyExport,
        { icon: FileText, label: 'Transcript', action: 'transcript' as const },
        { icon: Pencil, label: 'Edit', action: 'edit' as const },
      ] as const,
    [],
  )

  function handleAction(action: 'copy' | 'sync' | 'edit' | 'transcript') {
    setOpen(false)
    if (action === 'copy') onCopy()
    else if (action === 'sync') onSync()
    else if (action === 'transcript') onTranscript?.()
    else onEdit()
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-30 bg-background/40 backdrop-blur-[1px]"
            onClick={() => setOpen(false)}
            aria-hidden
          />
        )}
      </AnimatePresence>

      <div className="pointer-events-none fixed bottom-28 right-4 z-40 flex flex-col items-end gap-2">
        <AnimatePresence>
          {open &&
            fabActions.map((item, i) => {
              const Icon = item.icon
              return (
                <motion.div
                  key={item.action}
                  initial={{ opacity: 0, y: 10, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.85 }}
                  transition={{ delay: i * 0.05, ease: 'easeOut' }}
                  className="pointer-events-auto flex items-center gap-2"
                >
                  <span className="rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow">
                    {item.label}
                  </span>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.92 }}
                    onClick={() => handleAction(item.action)}
                    className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md transition-colors hover:bg-accent"
                    aria-label={item.label}
                  >
                    <Icon className="size-4" />
                  </motion.button>
                </motion.div>
              )
            })}
        </AnimatePresence>

        <motion.button
          type="button"
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setOpen((v) => !v)}
          className="pointer-events-auto flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg"
          aria-label="Actions"
          aria-expanded={open}
        >
          <MoreHorizontal className="size-5" />
        </motion.button>
      </div>
    </>
  )
}

function SyncTransferOverlay({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 backdrop-blur-sm"
          aria-live="polite"
          aria-label="Sync in progress"
        >
          <motion.div
            initial={{ y: 12, scale: 0.98, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 10, scale: 0.99, opacity: 0 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
            className="w-full max-w-md rounded-2xl border border-border/70 bg-card/95 px-5 py-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-center">
              <motion.span
                animate={{ opacity: [0.55, 1, 0.55] }}
                transition={{ duration: 1.1, repeat: Infinity, ease: 'easeInOut' }}
                className="text-sm font-semibold text-foreground"
              >
                Syncing...
              </motion.span>
            </div>

            <div className="relative h-24 overflow-hidden rounded-xl border border-border/50 bg-muted/35 px-4">
              <div className="relative flex h-full items-center justify-between">
                <div className="z-10 flex flex-col items-center gap-1.5">
                  <motion.div
                    className="flex size-10 items-center justify-center rounded-full border border-primary/40 bg-primary/15 text-primary"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <FileText className="size-5" aria-hidden />
                  </motion.div>
                  <span className="text-[11px] font-semibold tracking-wide text-foreground/90">EMR</span>
                </div>

                <div className="z-10 flex flex-col items-center gap-1.5">
                  <motion.div
                    className="flex size-10 items-center justify-center rounded-xl bg-primary shadow-md shadow-primary/25"
                    animate={{ scale: [1, 1.05, 1] }}
                    transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut', delay: 0.2 }}
                  >
                    <Zap className="size-5 text-primary-foreground" aria-hidden />
                  </motion.div>
                  <span className="text-[11px] font-semibold tracking-wide text-foreground/90">FastDoc</span>
                </div>
              </div>

              <div className="pointer-events-none absolute inset-x-16 top-[42%] h-1 -translate-y-1/2 overflow-hidden rounded-full bg-primary/20">
                <motion.div
                  className="h-full bg-primary/60"
                  animate={{ x: ['100%', '0%', '-100%'] }}
                  transition={{ duration: 1.15, repeat: Infinity, ease: 'linear' }}
                />
              </div>

              <motion.div
                className="pointer-events-none absolute top-[42%] size-3 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_14px_rgba(99,102,241,0.85)]"
                animate={{ left: ['84%', '16%'] }}
                transition={{ duration: 1.35, repeat: Infinity, ease: 'linear' }}
              />
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function initialBodiesFromReport(
  encounterReport?: EncounterReport | null,
  useDemoFallback = true,
): Record<SectionId, string> {
  const soapNote = encounterReport?.emr?.soapNote
  if (!soapNote) {
    if (useDemoFallback) {
      return Object.fromEntries(SECTIONS.map((s) => [s.id, s.defaultBody])) as Record<SectionId, string>
    }
    return {
      subjective: '',
      objective: '',
      assessment: '',
      plan: '',
    }
  }

  return {
    subjective: soapNote.subjective,
    objective: soapNote.objective,
    assessment: soapNote.assessment,
    plan: soapNote.plan,
  }
}

export function SoapPage({
  patient,
  encounterReport,
  encounterSummary,
  isGenerating,
  onOpenPatientPicker,
  onOpenTranscript,
  onSyncToEmr,
}: SoapPageProps) {
  const hasEncounterContext = Boolean(encounterSummary || encounterReport)
  const [expanded, setExpanded] = React.useState<Record<SectionId, boolean>>(() =>
    Object.fromEntries(SECTIONS.map((s) => [s.id, true])) as Record<SectionId, boolean>,
  )
  const [bodies, setBodies] = React.useState<Record<SectionId, string>>(() =>
    initialBodiesFromReport(encounterReport, !hasEncounterContext),
  )
  const [isEditing, setIsEditing] = React.useState(false)
  const [codeDetail, setCodeDetail] = React.useState<ClinicalCodeDetail | null>(null)
  const [isSyncAnimating, setIsSyncAnimating] = React.useState(false)

  React.useEffect(() => {
    setBodies(initialBodiesFromReport(encounterReport, !hasEncounterContext))
  }, [encounterReport, hasEncounterContext])

  const icdSuggestions = React.useMemo(
    () =>
      encounterReport?.icdSuggestions?.length
        ? encounterReport.icdSuggestions.map((row, index) =>
            toViewSuggestion(row, 'ICD', `icd-${row.code}-${row.rank}-${index}`),
          )
        : hasEncounterContext
          ? []
          : ICD_SUGGESTIONS,
    [encounterReport, hasEncounterContext],
  )

  const cptSuggestions = React.useMemo(
    () =>
      encounterReport?.cptSuggestions?.length
        ? encounterReport.cptSuggestions.map((row, index) =>
            toViewSuggestion(row, 'CPT', `cpt-${row.code}-${row.rank}-${index}`),
          )
        : hasEncounterContext
          ? []
          : CPT_SUGGESTIONS,
    [encounterReport, hasEncounterContext],
  )

  const allExpanded = SECTIONS.every((s) => expanded[s.id])

  function toggleExpandAll() {
    const next = !allExpanded
    setExpanded(Object.fromEntries(SECTIONS.map((s) => [s.id, next])) as Record<SectionId, boolean>)
  }

  function buildNoteText() {
    return SECTIONS.map((s) => `${s.label}\n${bodies[s.id]}`).join('\n\n')
  }

  function handleCopy() {
    void navigator.clipboard.writeText(buildNoteText()).then(
      () => toast.success('SOAP note copied to clipboard'),
      () => toast.error('Could not copy'),
    )
  }

  function buildChiefComplaintSyncPayload() {
    const icdCodeList = icdSuggestions.map((row) => row.code).join(', ')
    const cptCodeList = cptSuggestions.map((row) => row.code).join(', ')

    const presentIllnessText = [
      `Objective:\n${bodies.objective}`,
      `Assessment:\n${bodies.assessment}`,
      `Plan:\n${bodies.plan}`,
      `ICD: ${icdCodeList || 'None'}`,
      `CPT: ${cptCodeList || 'None'}`,
    ]
      .map((section) => section.trim())
      .filter(Boolean)
      .join('\n\n')

    return {
      chiefComplaintText: bodies.subjective.trim(),
      presentIllnessText,
      // MDLand: officevisit path uses procbar / SavePage visibility guard for reliable save.
      autoSave: true,
    }
  }

  async function handleSync() {
    const minVisualMs = 5000
    const startedAt = Date.now()
    setIsSyncAnimating(true)
    try {
      if (!onSyncToEmr) {
        toast.success('Sync (demo) — note would be sent to your EHR.')
        return
      }
      await onSyncToEmr(buildChiefComplaintSyncPayload())
    } finally {
      const elapsed = Date.now() - startedAt
      if (elapsed < minVisualMs) {
        await new Promise((resolve) => setTimeout(resolve, minVisualMs - elapsed))
      }
      setIsSyncAnimating(false)
    }
  }

  function handleSave() {
    setBodies((b) => {
      const next = { ...b }
      for (const s of SECTIONS) {
        next[s.id] = b[s.id].trim()
      }
      return next
    })
    setIsEditing(false)
  }

  const patientHeaderShellClass =
    'flex w-full items-center justify-between gap-3 rounded-lg bg-primary/20 p-4 shadow-sm ring-1 ring-primary/15'

  const patientHeaderBody = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-12 shrink-0 border-2 border-background">
          <AvatarFallback className="bg-primary/30 text-sm font-bold text-primary">
            {patient
              ? initialsFromName(patientDisplayName(patient))
              : encounterSummary?.patientId
                ? encounterSummary.patientId.slice(0, 2).toUpperCase()
                : '—'}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="truncate font-bold text-foreground">
            {patient
              ? patientDisplayName(patient)
              : encounterSummary?.patientId
                ? `Encounter patient ${encounterSummary.patientId.slice(0, 8)}`
                : 'Select a patient'}
          </h2>
          <p className="text-xs text-muted-foreground">
            {patient
              ? `DOB: ${formatDob(patient.dateOfBirth)}${
                  patient.clinicPatientId
                    ? ` • Patient ID ${patient.clinicPatientId}`
                    : patient.mrn
                      ? ` • ${patient.mrn}`
                      : ''
                }`
              : onOpenPatientPicker
                ? 'Tap to open the patient list and attach this note.'
                : 'Select a patient from the toolbar to attach this note.'}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        DONE
      </div>
    </>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col">
      <ScrollArea className="min-h-0 flex-1">
        <motion.div
          className="space-y-4 px-4 pb-36 pt-4"
          variants={soapPageListVariants}
          initial="hidden"
          animate="show"
        >
          <motion.section variants={soapPageItemVariants}>
            {!patient && onOpenPatientPicker ? (
              <button
                type="button"
                onClick={onOpenPatientPicker}
                className={cn(
                  patientHeaderShellClass,
                  'cursor-pointer text-left transition-colors hover:bg-primary/25 hover:ring-primary/25',
                )}
                aria-label="Select a patient"
              >
                {patientHeaderBody}
              </button>
            ) : (
              <div className={patientHeaderShellClass}>{patientHeaderBody}</div>
            )}
          </motion.section>

          {isGenerating ? (
            <motion.div
              variants={soapPageItemVariants}
              className="flex flex-col items-center justify-center gap-3 py-20"
            >
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              <p className="text-sm text-muted-foreground">Generating EMR note…</p>
            </motion.div>
          ) : (
            <>
              <motion.div
                variants={soapPageItemVariants}
                className="mb-2 flex items-center justify-between px-0.5"
              >
                <h3 className="text-base font-bold text-foreground">SOAP Note</h3>
                <button
                  type="button"
                  onClick={toggleExpandAll}
                  className="text-xs font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {allExpanded ? 'Collapse All' : 'Expand All'}
                </button>
              </motion.div>
              {hasEncounterContext && !encounterReport?.emr && (
                <motion.div
                  variants={soapPageItemVariants}
                  className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-3 text-sm text-muted-foreground"
                >
                  No EMR note exists for this encounter yet. Generate an EMR to populate SOAP and code
                  suggestions.
                </motion.div>
              )}

              {SECTIONS.map((s) => (
                <motion.div
                  key={s.id}
                  variants={soapPageItemVariants}
                  className={cn(
                    'rounded-2xl border border-border/60 border-l-4 bg-card p-4 shadow-sm',
                    s.borderClass,
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setExpanded((e) => ({ ...e, [s.id]: !e[s.id] }))}
                    className="mb-2 flex w-full items-center justify-between gap-2 text-left"
                  >
                    <span
                      className={cn(
                        'text-[10px] font-bold uppercase tracking-widest',
                        s.labelClass,
                      )}
                    >
                      {s.label}
                    </span>
                    {expanded[s.id] ? (
                      <ChevronUp className="size-4 shrink-0 text-muted-foreground/50" />
                    ) : (
                      <ChevronDown className="size-4 shrink-0 text-muted-foreground/50" />
                    )}
                  </button>
                  <AnimatePresence initial={false}>
                    {expanded[s.id] ? (
                      <motion.div
                        key={`${s.id}-body`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
                      >
                        {isEditing ? (
                          <Textarea
                            value={bodies[s.id]}
                            onChange={(e) =>
                              setBodies((b) => ({ ...b, [s.id]: e.target.value }))
                            }
                            className="min-h-[120px] resize-none text-sm leading-relaxed"
                            aria-label={s.label}
                          />
                        ) : (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                            {bodies[s.id]}
                          </p>
                        )}
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </motion.div>
              ))}

              <motion.div
                variants={soapPageItemVariants}
                className="mb-2 flex items-center gap-2 px-0.5"
              >
                <Sparkles className="size-5 shrink-0 text-amber-600 dark:text-amber-400" />
                <h3 className="text-base font-bold text-foreground">AI Suggested ICD</h3>
              </motion.div>
              {icdSuggestions.map((row) => (
                <motion.div key={row.id} variants={soapPageItemVariants}>
                  <ClinicalCodeCard
                    borderAccentClass="border-l-violet-500"
                    title={suggestionTitle(row)}
                    status={row.status}
                    code={row.code}
                    codeFieldLabel="ICD code"
                    description={row.description?.trim() || '-'}
                    descriptionFieldLabel="ICD description"
                    rationale={row.rationale?.trim() || '-'}
                    confidence={row.confidence}
                    onOpenDetail={() => setCodeDetail({ row })}
                  />
                </motion.div>
              ))}

              <motion.div
                variants={soapPageItemVariants}
                className="mb-2 flex items-center gap-2 px-0.5"
              >
                <Code2 className="size-5 shrink-0 text-teal-600 dark:text-teal-400" />
                <h3 className="text-base font-bold text-foreground">AI Suggested CPT</h3>
              </motion.div>
              {cptSuggestions.map((row) => (
                <motion.div key={row.id} variants={soapPageItemVariants}>
                  <ClinicalCodeCard
                    borderAccentClass="border-l-teal-500"
                    title={suggestionTitle(row)}
                    status={row.status}
                    code={row.code}
                    codeFieldLabel="CPT code"
                    description={row.description?.trim() || '-'}
                    descriptionFieldLabel="CPT description"
                    rationale={row.rationale?.trim() || '-'}
                    confidence={row.confidence}
                    onOpenDetail={() => setCodeDetail({ row })}
                  />
                </motion.div>
              ))}
            </>
          )}
        </motion.div>
      </ScrollArea>

      <ClinicalCodeDetailDialog
        detail={codeDetail}
        onOpenChange={(open) => {
          if (!open) setCodeDetail(null)
        }}
      />

      <SyncTransferOverlay open={isSyncAnimating} />

      {!isEditing ? (
        <SoapFabMenu
          onCopy={handleCopy}
          onSync={handleSync}
          onEdit={() => setIsEditing(true)}
          onTranscript={onOpenTranscript}
        />
      ) : null}

      <AnimatePresence>
        {isEditing ? (
          <motion.div
            key="soap-save-bar"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="pointer-events-none fixed inset-x-0 bottom-14 z-40 bg-transparent px-4 py-3"
          >
            <Button
              type="button"
              className="pointer-events-auto h-11 w-full text-base font-semibold shadow-[0_4px_14px_rgba(0,0,0,0.18)] dark:shadow-[0_4px_18px_rgba(0,0,0,0.45)]"
              onClick={handleSave}
            >
              Save
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
