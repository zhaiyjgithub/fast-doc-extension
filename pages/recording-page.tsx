import * as React from 'react'
import { differenceInYears, format, parseISO, isValid } from 'date-fns'
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import {
  mockLLMAttributeSpeakers,
  attributedSegmentsToTranscript,
  type RawSegment,
} from '@/lib/mock-llm-speaker-attribution'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { Loader2, Mic, Pause, Sparkles, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'
import { toast } from 'sonner'

type RecordingState = 'ready' | 'recording' | 'paused' | 'processing'

const DEMO_TRANSCRIPT =
  'Patient presents with persistent cough for 3 days. No fever reported. Denies shortness of breath. Has been taking over-the-counter cough suppressants with minimal relief. No known allergies. Vitals are within normal limits. Lung sounds clear bilaterally. Throat appears mildly erythematous.'

interface LiveLine {
  id: string
  speaker: 'Doctor' | 'Patient'
  text: string
  time: string
}

/** One new line every 2s after recording starts (line 1 at 2s, …, line 16 at 32s). */
const LIVE_LINE_REVEAL_SEC = Array.from({ length: 16 }, (_, i) => (i + 1) * 2)

const LIVE_MOCK: LiveLine[] = [
  {
    id: '1',
    speaker: 'Doctor',
    text: 'Hello—please tell me about your main concern today.',
    time: '00:05',
  },
  {
    id: '2',
    speaker: 'Patient',
    text: "I've had a headache for three days. I started running a fever yesterday—about 101°F.",
    time: '00:12',
  },
  {
    id: '3',
    speaker: 'Doctor',
    text: 'Any cough, runny nose, or sore throat?',
    time: '00:20',
  },
  {
    id: '4',
    speaker: 'Patient',
    text: 'No cough. The headache is really bad, especially across my forehead.',
    time: '00:28',
  },
  {
    id: '5',
    speaker: 'Doctor',
    text: 'Any neck stiffness, light sensitivity, or confusion?',
    time: '00:36',
  },
  {
    id: '6',
    speaker: 'Patient',
    text: 'Lights bother me a little. No stiff neck that I can tell.',
    time: '00:44',
  },
  {
    id: '7',
    speaker: 'Doctor',
    text: 'Have you taken anything for the fever or pain?',
    time: '00:52',
  },
  {
    id: '8',
    speaker: 'Patient',
    text: 'Ibuprofen last night—it helped for a few hours, then the headache came back.',
    time: '01:00',
  },
  {
    id: '9',
    speaker: 'Doctor',
    text: 'Any recent travel, sick contacts, or new medications?',
    time: '01:08',
  },
  {
    id: '10',
    speaker: 'Patient',
    text: 'No travel. My partner had a cold last week but I think I’m worse than that.',
    time: '01:16',
  },
  {
    id: '11',
    speaker: 'Doctor',
    text: 'Any nausea, vomiting, or vision changes?',
    time: '01:24',
  },
  {
    id: '12',
    speaker: 'Patient',
    text: 'A little nausea this morning. Vision is fine.',
    time: '01:32',
  },
  {
    id: '13',
    speaker: 'Doctor',
    text: 'I’ll check your vitals and do a quick neuro exam—follow my finger with your eyes.',
    time: '01:40',
  },
  {
    id: '14',
    speaker: 'Patient',
    text: 'Okay… that’s not making the headache worse.',
    time: '01:48',
  },
  {
    id: '15',
    speaker: 'Doctor',
    text: 'Temp is 100.4°F now. Lungs clear; throat mildly red. I’ll order a flu swab and basic labs.',
    time: '01:56',
  },
  {
    id: '16',
    speaker: 'Patient',
    text: 'Thank you—should I go home after that or wait here?',
    time: '02:04',
  },
]

function liveLinesForElapsed(seconds: number): LiveLine[] {
  let n = 0
  for (let i = 0; i < LIVE_LINE_REVEAL_SEC.length; i++) {
    if (seconds >= LIVE_LINE_REVEAL_SEC[i]) n = i + 1
  }
  return n === 0 ? [] : LIVE_MOCK.slice(0, Math.min(n, LIVE_MOCK.length))
}

interface RecordingPageProps {
  patient?: Patient | null
  /** Matched patient (e.g. via Match flow); combined with `patient` for recording context. */
  matchedPatient?: Patient | null
  onGenerateEMR: (transcript: string) => void
  /** Opens patient search sheet (e.g. from empty-state CTA). */
  onOpenPatientPicker?: () => void
  /** Opens patient sheet in “match” mode (same sheet, stored as matched patient). */
  onOpenMatchPatientPicker?: () => void
  /** Clears the current selected or matched patient for this visit (when idle or paused). */
  onDismissActivePatient?: () => void
}

function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`
}

function ageFromDob(iso: string): number | null {
  const d = parseISO(iso)
  if (!isValid(d)) return null
  return differenceInYears(new Date(), d)
}

function formatDobMmDdYyyy(iso: string): string | null {
  const d = parseISO(iso)
  if (!isValid(d)) return null
  return format(d, 'MM/dd/yyyy')
}

function genderDisplayLabel(gender: Patient['gender']): string | null {
  if (gender === 'Female') return 'F'
  if (gender === 'Male') return 'M'
  if (gender === 'Other') return 'Other'
  return null
}

function AudioWaveform({ compact = false }: { compact?: boolean }) {
  const count = compact ? 14 : 20
  const indices = React.useMemo(() => Array.from({ length: count }, (_, i) => i), [count])
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-1',
        compact ? 'h-10 max-w-[140px] gap-0.5' : 'h-16',
      )}
    >
      {indices.map((i) => (
        <motion.div
          key={i}
          className={cn('rounded-full bg-primary', compact ? 'w-0.5' : 'w-1')}
          animate={{
            height: compact
              ? [3, 6 + (i % 5) * 2 + ((i * 3) % 6), 3]
              : [4, 10 + (i % 6) * 4 + ((i * 5) % 10), 4],
          }}
          transition={{
            duration: 0.45 + (i % 4) * 0.1,
            repeat: Infinity,
            repeatType: 'mirror',
            delay: i * 0.05,
          }}
        />
      ))}
    </div>
  )
}

function RippleButton({
  children,
  onClick,
  disabled,
  className,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <motion.div className="relative overflow-hidden rounded-lg" whileTap={{ scale: 0.98 }}>
      <motion.div
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: disabled ? 0 : 1 }}
      >
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute rounded-full border-2 border-primary-foreground/30"
            style={{ width: '100%', height: '100%' }}
            animate={{ scale: [1, 1.5, 2], opacity: [0.5, 0.25, 0] }}
            transition={{ duration: 2, repeat: Infinity, delay: i * 0.6, ease: 'easeOut' }}
          />
        ))}
      </motion.div>
      <Button className={className} onClick={onClick} disabled={disabled}>
        {children}
      </Button>
    </motion.div>
  )
}

export function RecordingPage({
  patient,
  matchedPatient = null,
  onGenerateEMR,
  onOpenPatientPicker,
  onOpenMatchPatientPicker,
  onDismissActivePatient,
}: RecordingPageProps) {
  const [state, setState] = React.useState<RecordingState>('ready')
  const [elapsedTime, setElapsedTime] = React.useState(0)
  const [transcript, setTranscript] = React.useState('')
  const [liveLines, setLiveLines] = React.useState<LiveLine[]>([])
  const [showManualInput, setShowManualInput] = React.useState(false)
  const [compactRecordingHeader, setCompactRecordingHeader] = React.useState(false)
  const [dismissPatientWarningOpen, setDismissPatientWarningOpen] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const processingTranscriptTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const liveScriptSentinelRef = React.useRef<HTMLDivElement>(null)
  const prevLiveLineCountRef = React.useRef(0)
  // Refs that hold mutable values read inside speech callback (avoids stale closure)
  const elapsedTimeRef = React.useRef(0)
  const activeSpeakerRef = React.useRef<'Doctor' | 'Patient'>('Doctor')
  // Keep the MediaStream alive during recording so Chrome keeps the mic permission active
  const micStreamRef = React.useRef<MediaStream | null>(null)

  // ── Speech recognition ────────────────────────────────────────────────────
  const [activeSpeaker, setActiveSpeaker] = React.useState<'Doctor' | 'Patient'>('Doctor')

  const handleFinalResult = React.useCallback((text: string) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const time = formatTime(elapsedTimeRef.current)
    setLiveLines((prev) => [...prev, { id, speaker: activeSpeakerRef.current, text, time }])
  }, [])

  const speech = useSpeechRecognition({ onFinalResult: handleFinalResult, lang: 'en-US' })

  /**
   * Start a new visit recording from a direct click.
   *
   * Chrome Extension Side Panel does NOT show a mic permission prompt when
   * SpeechRecognition.start() is called directly — it immediately fires
   * "not-allowed". The only reliable way to get the permission popup is to
   * call getUserMedia() synchronously in the click handler, then keep the
   * stream ALIVE while SpeechRecognition is running. Stopping the tracks
   * early causes Chrome to revoke mic access for SR.
   */
  const beginNewRecordingFromClick = React.useCallback(() => {
    if (patient == null && matchedPatient == null) {
      toast.warning('Select a patient or match a patient to this visit before recording.')
      return
    }
    if (!speech.isSupported) {
      toast.error('Speech recognition is not supported in this browser.')
      setShowManualInput(true)
      return
    }

    // Stop any existing stream before requesting a new one
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null

    // getUserMedia from click handler → Chrome shows the permission popup here.
    // We intentionally do NOT stop the tracks so the mic stays active for SR.
    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStreamRef.current = stream
        setElapsedTime(0)
        setTranscript('')
        setLiveLines([])
        prevLiveLineCountRef.current = 0
        setState('recording')
        speech.start()
      })
      .catch((err: unknown) => {
        const name = err instanceof DOMException ? err.name : String(err)
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          toast.error(
            'Microphone access was denied. Open chrome://settings/content/microphone and allow this extension.',
          )
        } else {
          toast.error(`Could not access microphone: ${name}`)
        }
      })
  }, [patient, matchedPatient, speech.isSupported, speech.start])

  /** Stop mic stream helper — call whenever recording fully ends. */
  const stopMicStream = React.useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
  }, [])

  const togglePauseResume = React.useCallback(() => {
    if (state === 'recording') {
      speech.stop()
      // Keep micStreamRef alive on pause so SR can resume without re-requesting permission
      setState('paused')
      return
    }
    // Resume: mic stream is already open, just restart SR
    setState('recording')
    speech.start()
  }, [state, speech.start, speech.stop])

  // Cleanup mic stream on unmount
  React.useEffect(() => () => { stopMicStream() }, [stopMicStream])

  const updateRecordingHeaderCompact = React.useCallback(() => {
    const sc = scrollRef.current
    const sent = liveScriptSentinelRef.current
    if (!sc || !sent || (state !== 'recording' && state !== 'paused')) {
      setCompactRecordingHeader(false)
      return
    }
    const rootTop = sc.getBoundingClientRect().top
    const sentTop = sent.getBoundingClientRect().top
    setCompactRecordingHeader(sentTop < rootTop + 0.5)
  }, [state])

  React.useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => setElapsedTime((t) => t + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [state])

  // Keep mutable refs in sync with their state counterparts
  React.useEffect(() => { elapsedTimeRef.current = elapsedTime }, [elapsedTime])
  React.useEffect(() => { activeSpeakerRef.current = activeSpeaker }, [activeSpeaker])

  React.useEffect(() => {
    return () => {
      if (processingTranscriptTimerRef.current) {
        clearTimeout(processingTranscriptTimerRef.current)
        processingTranscriptTimerRef.current = null
      }
    }
  }, [])

  // Handle speech recognition errors (SR triggers its own mic permission flow)
  React.useEffect(() => {
    if (!speech.error) return
    if (speech.error === 'microphone-denied') {
      toast.error(
        'Microphone was blocked. In Chrome: Settings → Privacy and security → Site settings → Microphone — ensure sites can ask, then allow this extension when prompted.',
      )
      speech.reset()
      setState('ready')
      return
    }
    if (speech.error === 'not-supported') {
      toast.error('Speech recognition is not supported in this browser.')
      setShowManualInput(true)
      setState('ready')
    }
  }, [speech.error, speech.reset])

  /** Only when a new live line is appended — not on start/pause/resume alone. */
  React.useEffect(() => {
    const prev = prevLiveLineCountRef.current
    const next = liveLines.length
    const appended = next > prev
    prevLiveLineCountRef.current = next

    if (!appended || next === 0) return
    if (state !== 'recording' && state !== 'paused') return

    let innerRaf = 0
    const outerRaf = window.requestAnimationFrame(() => {
      innerRaf = window.requestAnimationFrame(() => {
        const sc = scrollRef.current
        if (sc) sc.scrollTo({ top: sc.scrollHeight, behavior: 'smooth' })
      })
    })
    return () => {
      window.cancelAnimationFrame(outerRaf)
      if (innerRaf) window.cancelAnimationFrame(innerRaf)
    }
  }, [liveLines.length, state])

  React.useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    sc.addEventListener('scroll', updateRecordingHeaderCompact, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateRecordingHeaderCompact) : null
    ro?.observe(sc)
    updateRecordingHeaderCompact()
    return () => {
      sc.removeEventListener('scroll', updateRecordingHeaderCompact)
      ro?.disconnect()
    }
  }, [updateRecordingHeaderCompact, liveLines.length, state])

  React.useEffect(() => {
    if (state !== 'recording' && state !== 'paused') {
      setCompactRecordingHeader(false)
    }
  }, [state])

  const handleStopRecording = () => {
    speech.stop()
    stopMicStream()

    // Build raw segments from live lines, ignoring the manual toggle speaker labels.
    // The mock LLM will re-attribute speakers based on linguistic heuristics.
    const rawSegments: RawSegment[] = liveLines.map((l, i) => ({
      idx: i,
      text: l.text,
      time: l.time,
    }))

    const attributed = mockLLMAttributeSpeakers(rawSegments)
    const fromLive = attributed.length > 0
      ? attributedSegmentsToTranscript(attributed)
      : ''

    if (processingTranscriptTimerRef.current) {
      clearTimeout(processingTranscriptTimerRef.current)
      processingTranscriptTimerRef.current = null
    }
    setTranscript('')
    setState('processing')
    processingTranscriptTimerRef.current = setTimeout(() => {
      setTranscript(fromLive || DEMO_TRANSCRIPT)
      processingTranscriptTimerRef.current = null
    }, 400)
  }

  const handleCancelGenerateAndResume = () => {
    if (processingTranscriptTimerRef.current) {
      clearTimeout(processingTranscriptTimerRef.current)
      processingTranscriptTimerRef.current = null
    }
    setTranscript('')
    setState('paused')
  }

  /** Paused (or similar) visit with clock or live lines — discarding patient would lose this session. */
  const hasRecordedSessionToDiscard =
    state === 'paused' && (elapsedTime > 0 || liveLines.length > 0)

  const resetRecordingSessionForNewPatient = React.useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (processingTranscriptTimerRef.current) {
      clearTimeout(processingTranscriptTimerRef.current)
      processingTranscriptTimerRef.current = null
    }
    speech.reset()
    stopMicStream()
    setActiveSpeaker('Doctor')
    setState('ready')
    setElapsedTime(0)
    setTranscript('')
    setLiveLines([])
    setShowManualInput(false)
    setCompactRecordingHeader(false)
    prevLiveLineCountRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopMicStream])

  function handleRequestDismissPatient() {
    if (!onDismissActivePatient) return
    if (hasRecordedSessionToDiscard) {
      setDismissPatientWarningOpen(true)
    } else {
      onDismissActivePatient()
    }
  }

  function handleConfirmDismissPatientAndDiscardRecording() {
    setDismissPatientWarningOpen(false)
    resetRecordingSessionForNewPatient()
    onDismissActivePatient?.()
    onOpenPatientPicker?.()
  }

  const activePatient = patient ?? matchedPatient ?? null

  function requirePatientOrMatch(): boolean {
    if (patient != null || matchedPatient != null) return true
    toast.warning('Select a patient or match a patient to this visit before recording.')
    return false
  }

  const age = activePatient?.dob ? ageFromDob(activePatient.dob) : null
  const patientDobFormatted = activePatient?.dob ? formatDobMmDdYyyy(activePatient.dob) : null
  const patientGenderLabel = activePatient?.gender
    ? genderDisplayLabel(activePatient.gender)
    : null

  return (
    <div className="flex h-full min-w-0 flex-col">
      <Dialog open={dismissPatientWarningOpen} onOpenChange={setDismissPatientWarningOpen}>
        <DialogContent
          showCloseButton
          className="flex max-h-[min(88vh,720px)] max-w-[calc(100vw-1.25rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
        >
          <DialogHeader className="shrink-0 space-y-2 border-b border-border px-5 py-4 pr-12 text-left">
            <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              Recording detail
            </p>
            <DialogTitle className="text-balance text-lg font-semibold leading-snug">
              Discard this recording?
            </DialogTitle>
            <DialogDescription className="sr-only">
              {`Removing the patient clears this visit's audio timer and live script. You may select another patient and start a new recording.`}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="min-h-0 max-h-[min(52vh,420px)] flex-1">
            <div className="space-y-4 px-5 py-4 text-left text-sm leading-relaxed">
              <p>
                <span className="text-muted-foreground">What happens: </span>
                <span className="text-foreground/90">
                  Removing the patient clears the visit audio, timer, and live script for this
                  session. You can then select another patient and start a new recording.
                </span>
              </p>
            </div>
          </ScrollArea>

          <DialogFooter className="shrink-0 flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-center sm:gap-3">
            <Button
              type="button"
              variant="outline"
              className="w-full sm:mt-0 sm:w-auto"
              onClick={() => setDismissPatientWarningOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="w-full sm:w-auto"
              onClick={handleConfirmDismissPatientAndDiscardRecording}
            >
              Yes, discard and choose patient
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div
        ref={scrollRef}
        className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain"
      >
        <motion.div
          className="space-y-4 px-4 pb-28 pt-4"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {activePatient ? (
            <section
              className={cn(
                'relative rounded-lg bg-primary/25 p-4 shadow-sm ring-1 ring-primary/20',
                onDismissActivePatient &&
                  state !== 'recording' &&
                  state !== 'processing' &&
                  'pr-12',
              )}
            >
              {onDismissActivePatient &&
                state !== 'recording' &&
                state !== 'processing' && (
                  <button
                    type="button"
                    onClick={handleRequestDismissPatient}
                    className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border border-border/90 bg-card text-muted-foreground shadow-md ring-1 ring-border/30 transition-colors hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-muted/80"
                    aria-label="Remove patient from this visit"
                  >
                    <X className="size-4 shrink-0" aria-hidden />
                  </button>
                )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                  {patient != null ? 'Active patient' : 'Matched patient'}
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    state === 'recording' && 'text-destructive',
                    state === 'paused' && 'text-amber-600 dark:text-amber-400',
                    state === 'ready' && 'text-muted-foreground',
                    state === 'processing' && 'text-muted-foreground',
                  )}
                >
                  {state === 'recording' && 'Recording'}
                  {state === 'paused' && 'Paused'}
                  {state === 'ready' && 'Ready'}
                  {state === 'processing' && 'Processing'}
                </span>
              </div>
              <h2 className="mt-1 text-lg font-extrabold text-foreground">
                {activePatient.name}
                {age != null ? `, ${age} yrs` : ''}
              </h2>
              {(patientDobFormatted || patientGenderLabel) && (
                <p className="mt-1 text-xs font-medium text-muted-foreground">
                  {patientDobFormatted ? <>DOB: {patientDobFormatted}</> : null}
                  {patientDobFormatted && patientGenderLabel ? (
                    <span aria-hidden> · </span>
                  ) : null}
                  {patientGenderLabel ? <>Gender: {patientGenderLabel}</> : null}
                </p>
              )}
              {activePatient.idNumber && (
                <p className="text-xs font-medium text-muted-foreground">{activePatient.idNumber}</p>
              )}
            </section>
          ) : onOpenPatientPicker ? (
            <div className="space-y-3">
              <button
                type="button"
                onClick={onOpenPatientPicker}
                className="w-full rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/40 hover:text-foreground"
              >
                Tap to select a patient and attach this visit.
              </button>
              <button
                type="button"
                onClick={() => onOpenMatchPatientPicker?.()}
                className="w-full rounded-lg border border-dashed border-emerald-400/80 bg-emerald-50/70 p-4 text-center text-sm text-emerald-950 transition-colors hover:border-emerald-500 hover:bg-emerald-100/90 hover:text-emerald-950 dark:border-emerald-600 dark:bg-emerald-950/35 dark:text-emerald-50 dark:hover:border-emerald-500 dark:hover:bg-emerald-950/55"
              >
                Tap to match a patient and attach this visit.
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-muted-foreground/30 bg-muted/20 p-4 text-center text-sm text-muted-foreground">
              Select a patient from the toolbar to attach this visit.
            </div>
          )}

          <AnimatePresence mode="wait">
            {state === 'ready' && !showManualInput && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex flex-col items-center justify-center space-y-6 py-10"
              >
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-full bg-primary/20"
                    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.2, 0.5] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={beginNewRecordingFromClick}
                    className="relative flex h-24 w-24 items-center justify-center rounded-full bg-primary shadow-lg"
                    aria-label="Start recording"
                  >
                    <Mic className="size-10 text-primary-foreground" />
                  </motion.button>
                </div>
                <p className="text-sm text-muted-foreground">Tap to start recording</p>
                <button
                  type="button"
                  onClick={() => {
                    if (!requirePatientOrMatch()) return
                    setShowManualInput(true)
                  }}
                  className="text-sm text-primary underline-offset-2 hover:underline"
                >
                  Or type/paste transcript manually
                </button>
              </motion.div>
            )}

            {state === 'ready' && showManualInput && (
              <motion.div
                key="manual"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="space-y-4"
              >
                <Textarea
                  placeholder="Paste or type the consultation transcript here..."
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  className="min-h-[200px] text-sm"
                />
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => {
                      setShowManualInput(false)
                      setTranscript('')
                    }}
                  >
                    Cancel
                  </Button>
                  <RippleButton
                    className="h-10 flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => {
                      if (!requirePatientOrMatch()) return
                      onGenerateEMR(transcript)
                    }}
                    disabled={!transcript.trim()}
                  >
                    <Sparkles className="mr-2 size-4" />
                    Generate EMR
                  </RippleButton>
                </div>
              </motion.div>
            )}

            {(state === 'recording' || state === 'paused') && (
              <motion.div
                key="recording"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-6"
              >
                <div
                  className={cn(
                    'space-y-6 transition-opacity duration-200',
                    compactRecordingHeader && 'pointer-events-none opacity-30',
                  )}
                >
                  <Card className="overflow-hidden py-0 shadow-sm">
                    <CardContent className="space-y-4 p-6">
                      <div
                        className="rounded-xl p-4"
                        style={{
                          background:
                            'linear-gradient(135deg, oklch(0.962 0.018 272.314), oklch(0.93 0.034 272.788))',
                        }}
                      >
                        {state === 'recording' ? (
                          <AudioWaveform />
                        ) : (
                          <div className="flex h-16 items-center justify-center">
                            <Pause className="size-8 text-primary/50" />
                          </div>
                        )}
                      </div>
                      <div className="text-center">
                        <span className="font-mono text-3xl tabular-nums text-foreground">
                          {formatTime(elapsedTime)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="flex items-center justify-center gap-4">
                    <motion.div whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="outline"
                        size="lg"
                        className="size-14 rounded-full"
                        onClick={togglePauseResume}
                      >
                        {state === 'recording' ? (
                          <Pause className="size-6" />
                        ) : (
                          <Mic className="size-6" />
                        )}
                      </Button>
                    </motion.div>
                    <motion.div whileTap={{ scale: 0.95 }}>
                      <Button
                        variant="destructive"
                        size="lg"
                        className="size-14 rounded-full"
                        onClick={handleStopRecording}
                      >
                        <Square className="size-6 fill-current" />
                      </Button>
                    </motion.div>
                  </div>
                </div>

                <div ref={liveScriptSentinelRef} className="h-px w-full shrink-0" aria-hidden />

                {compactRecordingHeader && (
                  <div className="sticky top-0 z-20 -mx-4 flex items-center gap-2 border-b border-border/60 bg-background/95 px-4 py-2.5 shadow-sm backdrop-blur-md">
                    <div
                      className="min-w-0 flex-1 rounded-lg px-2 py-1"
                      style={{
                        background:
                          'linear-gradient(135deg, oklch(0.962 0.018 272.314), oklch(0.93 0.034 272.788))',
                      }}
                    >
                      {state === 'recording' ? (
                        <AudioWaveform compact />
                      ) : (
                        <div className="flex h-10 items-center justify-center">
                          <Pause className="size-6 text-primary/50" />
                        </div>
                      )}
                    </div>
                    <span className="shrink-0 font-mono text-xl font-semibold tabular-nums text-foreground">
                      {formatTime(elapsedTime)}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="size-10 shrink-0 rounded-full"
                      onClick={togglePauseResume}
                    >
                      {state === 'recording' ? (
                        <Pause className="size-5" />
                      ) : (
                        <Mic className="size-5" />
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="size-10 shrink-0 rounded-full"
                      onClick={handleStopRecording}
                    >
                      <Square className="size-5 fill-current" />
                    </Button>
                  </div>
                )}

                <section className="space-y-3 border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h3 className="text-sm font-bold text-foreground">Live script</h3>
                    <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted p-0.5">
                      {(['Doctor', 'Patient'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setActiveSpeaker(s)}
                          className={cn(
                            'rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase transition-colors',
                            activeSpeaker === s
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="min-h-[100px] rounded-lg border border-border bg-card p-4 shadow-sm ring-1 ring-border/40">
                    {liveLines.length === 0 && !speech.interimText ? (
                      <p className="text-center text-xs leading-relaxed text-muted-foreground">
                        {state === 'paused'
                          ? 'Paused — script will continue when you resume.'
                          : 'Listening… lines will appear as speech is detected.'}
                      </p>
                    ) : (
                      <ul className="flex flex-col gap-3">
                        {liveLines.map((line) => (
                          <li
                            key={line.id}
                            className={cn(
                              'flex flex-col gap-1',
                              line.speaker === 'Patient' && 'items-end',
                            )}
                          >
                            <div className="flex w-full items-baseline justify-between gap-2 px-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                                {line.speaker}
                              </span>
                              <span className="font-mono text-[10px] text-muted-foreground/70">
                                {line.time}
                              </span>
                            </div>
                            <p
                              className={cn(
                                'max-w-[95%] text-sm leading-relaxed text-muted-foreground',
                                line.speaker === 'Patient' &&
                                  'rounded-2xl rounded-tr-none bg-background px-3 py-2.5 text-foreground shadow-sm',
                              )}
                            >
                              {line.text}
                            </p>
                          </li>
                        ))}
                        {speech.interimText && (
                          <li className="flex flex-col gap-1 opacity-50">
                            <span className="px-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                              {activeSpeaker}
                            </span>
                            <p className="text-sm italic leading-relaxed text-muted-foreground">
                              {speech.interimText}
                            </p>
                          </li>
                        )}
                      </ul>
                    )}
                  </div>
                </section>
              </motion.div>
            )}

            {state === 'processing' && (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="space-y-4"
              >
                {!transcript ? (
                  <div className="flex flex-col items-center justify-center space-y-4 py-12">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Processing audio…</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground" htmlFor="review-transcript">
                        Transcript
                      </label>
                      <Textarea
                        id="review-transcript"
                        value={transcript}
                        onChange={(e) => setTranscript(e.target.value)}
                        className="min-h-[200px] text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        Review and edit before generating the EMR
                      </p>
                    </div>
                    <Button
                      className="h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() => onGenerateEMR(transcript)}
                      disabled={!transcript.trim()}
                    >
                      <Sparkles className="mr-2 size-4" />
                      Generate AI Clinical Note
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-11 w-full"
                      onClick={handleCancelGenerateAndResume}
                    >
                      Cancel and continue recording
                    </Button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
