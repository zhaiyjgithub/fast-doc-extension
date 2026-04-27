import * as React from 'react'
import { differenceInYears, format, parseISO, isValid } from 'date-fns'
import { useDeepgramSTT } from '@/hooks/use-deepgram-stt'
import { getDeepgramTemporaryToken } from '@/lib/deepgram-temporary-token'
import { deepgramApiKey } from '@/lib/env'
import {
  DEFAULT_DEEPGRAM_STT_LANGUAGE,
  DEEPGRAM_NOVA3_STT_LANGUAGES,
} from '@/lib/deepgram-nova3-stt-languages'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Loader2, Mic, NotebookPen, Pause, ScrollText, Sparkles, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { cn } from '@/lib/utils'
import type { Patient } from '@/components/patient/patient-search-sheet'
import { toast } from 'sonner'
import { avatarFallbackClassForName } from '@/lib/avatar-fallback-by-name'

const DEEPGRAM_API_KEY = deepgramApiKey()
const DEEPGRAM_CONNECT_TIMEOUT_MS = 15_000

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
  onGenerateEMR: (
    transcript: string,
    conversationDurationSeconds?: number,
    source?: 'voice' | 'paste',
    providerContext?: string,
  ) => void
  /** Opens patient search sheet (e.g. from empty-state CTA or Search). */
  onOpenPatientPicker?: () => void
  /** Optional callback when tapping “match patient” (e.g. scrape EMR demographics into visit context). */
  onTapMatchPatient?: () => void
  /** Clears the current selected or matched patient for this visit (when idle or paused). */
  onDismissActivePatient?: () => void
  /** Opens patient details page from the active patient card. */
  onOpenPatientDetail?: () => void
}

function EmrContextTranscriptTabs({
  transcript,
  onTranscriptChange,
  emrContext,
  onEmrContextChange,
  transcriptId,
  transcriptPlaceholder,
}: {
  transcript: string
  onTranscriptChange: (value: string) => void
  emrContext: string
  onEmrContextChange: (value: string) => void
  transcriptId?: string
  transcriptPlaceholder: string
}) {
  return (
    <Tabs defaultValue="transcript" className="w-full">
      <TabsList className="grid w-full grid-cols-2 items-center gap-1.5 p-1.5">
        <TabsTrigger value="context" className="w-full">
          <NotebookPen className="size-4 shrink-0" aria-hidden />
          Context
        </TabsTrigger>
        <TabsTrigger value="transcript" className="w-full">
          <ScrollText className="size-4 shrink-0" aria-hidden />
          Transcript
        </TabsTrigger>
      </TabsList>
      <TabsContent value="context" className="mt-3.5">
        <Textarea
          placeholder="Optional: facts not in the transcript (e.g. after-visit additions). Used for patient/guideline search and the clinical note."
          value={emrContext}
          onChange={(e) => onEmrContextChange(e.target.value)}
          className="min-h-[200px] text-sm"
        />
      </TabsContent>
      <TabsContent value="transcript" className="mt-3.5">
        <Textarea
          id={transcriptId}
          placeholder={transcriptPlaceholder}
          value={transcript}
          onChange={(e) => onTranscriptChange(e.target.value)}
          className="min-h-[200px] text-sm"
        />
      </TabsContent>
    </Tabs>
  )
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

function patientDisplayName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`.trim()
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

export function RecordingPage({
  patient,
  onGenerateEMR,
  onOpenPatientPicker,
  onTapMatchPatient,
  onDismissActivePatient,
  onOpenPatientDetail,
}: RecordingPageProps) {
  const [state, setState] = React.useState<RecordingState>('ready')
  /** Deepgram `nova-3` STT language (BCP-47); applied on next recording session. */
  const [sttLanguage, setSttLanguage] = React.useState(DEFAULT_DEEPGRAM_STT_LANGUAGE)
  const [isConnectingDeepgram, setIsConnectingDeepgram] = React.useState(false)
  const [elapsedTime, setElapsedTime] = React.useState(0)
  const [transcript, setTranscript] = React.useState(
    `Doctor: Good morning. What brings you in today?\n` +
    `Patient: Hi, doctor. I've been having a really bad cough for about two weeks now. It started with a runny nose and sore throat, but those are mostly gone. Now it's mostly this deep chest cough that won't go away.\n` +
    `Doctor: I see. Is the cough dry, or are you bringing up any mucus?\n` +
    `Patient: Mostly dry, but sometimes in the morning there's some yellowish stuff.\n` +
    `Doctor: Any fever or chills?\n` +
    `Patient: I had a low-grade fever a few days ago—around 38 degrees—but it's been normal since yesterday.\n` +
    `Doctor: Any shortness of breath or chest pain when you cough or breathe deeply?\n` +
    `Patient: A little shortness of breath when I climb stairs, and the coughing fits do make my chest sore.\n` +
    `Doctor: Okay. Have you been around anyone who was sick recently, or any exposure to chemicals or smoke?\n` +
    `Patient: My coworker had the flu last week. I don't smoke, but our office has been dusty from some renovation work.\n` +
    `Doctor: Understood. Any history of asthma, COPD, or recurring chest infections?\n` +
    `Patient: No, I've always been pretty healthy. No allergies that I know of either.\n` +
    `Doctor: Alright. Based on your symptoms—the productive cough, low-grade fever, and chest discomfort—I want to listen to your lungs and possibly order a chest X-ray to rule out pneumonia. It could also be acute bronchitis, which is very common after a viral upper respiratory infection.\n` +
    `Patient: Is it serious? Do I need antibiotics?\n` +
    `Doctor: If it's bacterial pneumonia, yes. But acute bronchitis is usually viral and resolves on its own. Let's do the exam and imaging first before deciding. In the meantime, I'll recommend rest, plenty of fluids, and a cough suppressant if the cough is disrupting your sleep.\n` +
    `Patient: Okay, that makes sense. Thank you, doctor.`
  )
  const [liveLines, setLiveLines] = React.useState<LiveLine[]>([])
  const [showManualInput, setShowManualInput] = React.useState(false)
  const [emrContext, setEmrContext] = React.useState('')
  const [compactRecordingHeader, setCompactRecordingHeader] = React.useState(false)
  const [dismissPatientWarningOpen, setDismissPatientWarningOpen] = React.useState(false)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)
  const processingTranscriptTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const liveScriptSentinelRef = React.useRef<HTMLDivElement>(null)
  const prevLiveLineCountRef = React.useRef(0)
  const isResumingFromProcessingRef = React.useRef(false)
  // Ref that holds elapsed time read inside the Deepgram final-segment callback (avoids stale closure)
  const elapsedTimeRef = React.useRef(0)


  // Keep the MediaStream alive during recording so Chrome keeps the mic permission active
  const micStreamRef = React.useRef<MediaStream | null>(null)

  // ── Microphone permission state ───────────────────────────────────────────
  // 'unknown' = not yet checked, 'granted' | 'prompt' | 'denied'
  const [micPermission, setMicPermission] = React.useState<'unknown' | 'granted' | 'prompt' | 'denied'>('unknown')

  React.useEffect(() => {
    if (!navigator.permissions) { setMicPermission('prompt'); return }
    navigator.permissions
      .query({ name: 'microphone' as PermissionName })
      .then((status) => {
        setMicPermission(status.state as 'granted' | 'prompt' | 'denied')
        status.onchange = () => setMicPermission(status.state as 'granted' | 'prompt' | 'denied')
      })
      .catch(() => setMicPermission('prompt'))
  }, [])

  // ── Deepgram STT ──────────────────────────────────────────────────────────
  const handleFinalSegment = React.useCallback(
    (text: string, speaker: 'Doctor' | 'Patient') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const time = formatTime(elapsedTimeRef.current)
      setLiveLines((prev) => [...prev, { id, speaker, text, time }])
    },
    [],
  )

  const fetchDeepgramAccessToken = React.useCallback(
    () => getDeepgramTemporaryToken(DEEPGRAM_API_KEY),
    [],
  )

  const deepgram = useDeepgramSTT({
    apiKey: DEEPGRAM_API_KEY,
    getAccessToken: fetchDeepgramAccessToken,
    language: sttLanguage,
    onFinalSegment: handleFinalSegment,
  })

  const beginNewRecordingFromClick = React.useCallback(() => {
    if (patient == null) {
      toast.warning('Select or match a patient for this visit before recording.')
      return
    }
    if (!DEEPGRAM_API_KEY) {
      toast.error('Deepgram API key is not configured. See .env.example (dev vs production).')
      setShowManualInput(true)
      return
    }

    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStreamRef.current = stream
        setMicPermission('granted')
        setElapsedTime(0)
        setTranscript('')
        setEmrContext('')
        setLiveLines([])
        prevLiveLineCountRef.current = 0
        setState('recording')
        setIsConnectingDeepgram(true)
        deepgram.start(stream)
      })
      .catch((err: unknown) => {
        setMicPermission('denied')
        const name = err instanceof DOMException ? err.name : String(err)
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          toast.error('Microphone blocked. See the setup guide below.')
        } else {
          toast.error(`Could not access microphone: ${name}`)
        }
      })
  }, [patient, deepgram.start])

  const handleCancelGenerateAndResume = React.useCallback(() => {
    if (processingTranscriptTimerRef.current) {
      clearTimeout(processingTranscriptTimerRef.current)
      processingTranscriptTimerRef.current = null
    }

    if (!DEEPGRAM_API_KEY) {
      toast.error('Deepgram API key is not configured. See .env.example (dev vs production).')
      setShowManualInput(true)
      return
    }

    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null

    navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStreamRef.current = stream
        setMicPermission('granted')
        isResumingFromProcessingRef.current = true
        setIsConnectingDeepgram(true)
        deepgram.start(stream)
      })
      .catch((err: unknown) => {
        setIsConnectingDeepgram(false)
        const preserveProcessing =
          isResumingFromProcessingRef.current && transcript.trim().length > 0
        isResumingFromProcessingRef.current = false
        setState(preserveProcessing ? 'processing' : 'ready')
        setMicPermission('denied')
        const name = err instanceof DOMException ? err.name : String(err)
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          toast.error('Microphone blocked. See the setup guide below.')
        } else {
          toast.error(`Could not access microphone: ${name}`)
        }
      })
  }, [deepgram.start, transcript])

  /** Stop mic stream helper — call whenever recording fully ends. */
  const stopMicStream = React.useCallback(() => {
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
  }, [])

  const togglePauseResume = React.useCallback(() => {
    if (isConnectingDeepgram) return
    if (state === 'recording') {
      deepgram.pause()
      setState('paused')
      return
    }
    // Resume: mic stream still open, MediaRecorder resumes inside hook
    deepgram.resume()
    setState('recording')
  }, [state, isConnectingDeepgram, deepgram.pause, deepgram.resume])

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
    if (state === 'recording' && !isConnectingDeepgram) {
      timerRef.current = setInterval(() => setElapsedTime((t) => t + 1), 1000)
    } else if (timerRef.current) {
      clearInterval(timerRef.current)
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [state, isConnectingDeepgram])

  // Keep mutable refs in sync with their state counterparts
  React.useEffect(() => { elapsedTimeRef.current = elapsedTime }, [elapsedTime])



  React.useEffect(() => {
    return () => {
      if (processingTranscriptTimerRef.current) {
        clearTimeout(processingTranscriptTimerRef.current)
        processingTranscriptTimerRef.current = null
      }
    }
  }, [])

  React.useEffect(() => {
    if (!deepgram.isConnected) return
    setIsConnectingDeepgram(false)
    if (isResumingFromProcessingRef.current) {
      isResumingFromProcessingRef.current = false
      setTranscript('')
      setState('recording')
    }
  }, [deepgram.isConnected])

  React.useEffect(() => {
    if (!isConnectingDeepgram) return
    const timeout = setTimeout(() => {
      deepgram.reset()
      stopMicStream()

      const preserveProcessing =
        isResumingFromProcessingRef.current && transcript.trim().length > 0
      isResumingFromProcessingRef.current = false
      setIsConnectingDeepgram(false)
      setState(preserveProcessing ? 'processing' : 'ready')
      toast.error('Deepgram connection timed out. Please try again.')
    }, DEEPGRAM_CONNECT_TIMEOUT_MS)

    return () => clearTimeout(timeout)
  }, [isConnectingDeepgram, deepgram.reset, stopMicStream, transcript])

  // Handle Deepgram connection errors
  React.useEffect(() => {
    if (!deepgram.error) return
    const isResumingFromProcessing = isResumingFromProcessingRef.current
    isResumingFromProcessingRef.current = false
    setIsConnectingDeepgram(false)
    const preserveProcessing = isResumingFromProcessing && transcript.trim().length > 0
    if (deepgram.error === 'api-key-missing') {
      toast.error('Deepgram API key not set. See .env.example (dev vs production).')
      if (!preserveProcessing) {
        setShowManualInput(true)
        setState('ready')
      } else {
        setState('processing')
      }
      return
    }
    if (deepgram.error === 'token-fetch-failed') {
      toast.error(
        'Could not obtain a Deepgram access token. Check your API key and network, then try again.',
      )
      if (!preserveProcessing) {
        setState('ready')
      } else {
        setState('processing')
      }
      return
    }
    if (deepgram.error === 'connection-failed') {
      toast.error('Deepgram connection failed. Check your API key and network, then try again.')
      if (!preserveProcessing) {
        setState('ready')
      } else {
        setState('processing')
      }
      return
    }
    if (deepgram.error === 'recorder-failed') {
      toast.error('Microphone recorder error. Try reloading the extension.')
      if (!preserveProcessing) {
        setState('ready')
      } else {
        setState('processing')
      }
    }
  }, [deepgram.error, transcript])

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
    if (isConnectingDeepgram) return
    deepgram.stop()
    stopMicStream()

    // Transcript already has speaker labels from Deepgram diarization
    const fromLive =
      liveLines.length > 0
        ? liveLines.map((l) => `${l.speaker}: ${l.text}`).join('\n\n').trim()
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
    deepgram.reset()
    stopMicStream()
    isResumingFromProcessingRef.current = false
    setIsConnectingDeepgram(false)
    setState('ready')
    setElapsedTime(0)
    setTranscript('')
    setEmrContext('')
    setLiveLines([])
    setShowManualInput(false)
    setCompactRecordingHeader(false)
    prevLiveLineCountRef.current = 0
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopMicStream, deepgram.reset])

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
  }

  const activePatient = patient ?? null

  function requirePatientOrMatch(): boolean {
    if (patient != null) return true
    toast.warning('Select or match a patient for this visit before recording.')
    return false
  }

  const age = activePatient?.dateOfBirth ? ageFromDob(activePatient.dateOfBirth) : null
  const patientDobFormatted = activePatient?.dateOfBirth
    ? formatDobMmDdYyyy(activePatient.dateOfBirth)
    : null
  const patientGenderLabel = activePatient?.gender
    ? genderDisplayLabel(activePatient.gender)
    : null
  const patientStatusLabel = isConnectingDeepgram
    ? 'Connecting'
    : state === 'recording'
      ? 'Recording'
      : state === 'paused'
        ? 'Paused'
        : state === 'ready'
          ? 'Ready'
          : 'Processing'

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
              role={onOpenPatientDetail ? 'button' : undefined}
              tabIndex={onOpenPatientDetail ? 0 : undefined}
              onClick={onOpenPatientDetail}
              onKeyDown={
                onOpenPatientDetail
                  ? (event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onOpenPatientDetail()
                      }
                    }
                  : undefined
              }
              className={cn(
                'relative rounded-lg bg-primary/25 p-4 shadow-sm ring-1 ring-primary/20',
                onOpenPatientDetail &&
                  'cursor-pointer transition-colors hover:bg-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
                    onClick={(event) => {
                      event.stopPropagation()
                      handleRequestDismissPatient()
                    }}
                    className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full border border-border/90 bg-card text-muted-foreground shadow-md ring-1 ring-border/30 transition-colors hover:bg-muted hover:text-foreground dark:bg-background dark:hover:bg-muted/80"
                    aria-label="Remove patient from this visit"
                  >
                    <X className="size-4 shrink-0" aria-hidden />
                  </button>
                )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-foreground/70">
                  Active patient
                </span>
                <span
                  className={cn(
                    'shrink-0 text-xs font-semibold',
                    isConnectingDeepgram && 'text-muted-foreground',
                    !isConnectingDeepgram && state === 'recording' && 'text-destructive',
                    state === 'paused' && 'text-amber-600 dark:text-amber-400',
                    state === 'ready' && 'text-muted-foreground',
                    state === 'processing' && 'text-muted-foreground',
                  )}
                >
                  {patientStatusLabel}
                </span>
              </div>
              <div className="mt-2 flex items-start gap-3">
                <Avatar className="size-12 shrink-0 rounded-full">
                  <AvatarFallback
                    className={cn(
                      'text-xs font-semibold',
                      avatarFallbackClassForName(patientDisplayName(activePatient)),
                    )}
                  >
                    {initialsFromDisplayName(patientDisplayName(activePatient))}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold text-foreground">
                    {patientDisplayName(activePatient)}
                    {age != null ? `, ${age} yrs` : ''}
                  </h2>
                  {(patientDobFormatted || patientGenderLabel) && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      {patientDobFormatted ? <>DOB: {patientDobFormatted}</> : null}
                      {patientDobFormatted && patientGenderLabel ? <span aria-hidden> · </span> : null}
                      {patientGenderLabel ? <>Gender: {patientGenderLabel}</> : null}
                    </p>
                  )}
                  {(activePatient.clinicPatientId || activePatient.mrn) && (
                    <p className="mt-1 text-xs font-medium text-muted-foreground">
                      Patient ID: {activePatient.clinicPatientId ?? activePatient.mrn}
                    </p>
                  )}
                </div>
              </div>
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
                onClick={() => {
                  onTapMatchPatient?.()
                }}
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
                {/* Microphone permission banner — shown when blocked or after a failed attempt */}
                {micPermission === 'denied' && (
                  <div className="w-full rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm space-y-3">
                    <p className="font-semibold text-destructive flex items-center gap-2">
                      <span>🎙️</span> Microphone access is blocked
                    </p>
                    <p className="text-muted-foreground leading-relaxed">
                      Chrome Extension side panels need explicit microphone permission.
                      To fix this, open a new Chrome tab, paste the following URL and add
                      this extension's origin to the Allowed list:
                    </p>
                    <code className="block rounded bg-muted px-3 py-2 text-xs font-mono break-all select-all">
                      chrome://settings/content/microphone
                    </code>
                    <p className="text-muted-foreground leading-relaxed text-xs">
                      Alternatively, right-click the FastDoc extension icon → <strong>Inspect popup</strong>,
                      open the Console tab, and run:<br />
                      <code className="font-mono">navigator.mediaDevices.getUserMedia({'{'} audio: true {'}'})</code><br />
                      This opens the permission prompt in a context where Chrome allows it.
                    </p>
                    <button
                      type="button"
                      onClick={beginNewRecordingFromClick}
                      className="w-full rounded-md border border-destructive/50 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Retry microphone access
                    </button>
                  </div>
                )}
                <div className="w-full max-w-sm space-y-2">
                  <label htmlFor="deepgram-stt-language" className="text-xs font-semibold text-muted-foreground">
                    Transcription language
                  </label>
                  <Select value={sttLanguage} onValueChange={setSttLanguage}>
                    <SelectTrigger id="deepgram-stt-language" className="w-full bg-card text-left">
                      <SelectValue placeholder="Language" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[min(320px,50vh)]">
                      {DEEPGRAM_NOVA3_STT_LANGUAGES.map((opt) => (
                        <SelectItem key={opt.code} value={opt.code}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
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
                <EmrContextTranscriptTabs
                  transcript={transcript}
                  onTranscriptChange={setTranscript}
                  emrContext={emrContext}
                  onEmrContextChange={setEmrContext}
                  transcriptPlaceholder="Paste or type the consultation transcript here..."
                />
                <div className="flex items-stretch gap-2">
                  <Button
                    variant="outline"
                    className="h-10 min-h-10 flex-1"
                    onClick={() => {
                      setShowManualInput(false)
                      setTranscript('')
                      setEmrContext('')
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 min-h-10 flex-1 border-yellow-500 bg-yellow-400 text-foreground hover:bg-yellow-500"
                    onClick={() => {
                      if (!requirePatientOrMatch()) return
                      onGenerateEMR(transcript, elapsedTime, 'paste', emrContext.trim() || undefined)
                    }}
                    disabled={!transcript.trim()}
                  >
                    <Sparkles className="mr-2 size-4" />
                    Generate EMR
                  </Button>
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
                        {isConnectingDeepgram ? (
                          <div className="flex h-16 items-center justify-center">
                            <Loader2 className="size-8 animate-spin text-primary/60" />
                          </div>
                        ) : state === 'recording' ? (
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
                        disabled={isConnectingDeepgram}
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
                        disabled={isConnectingDeepgram}
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
                      {isConnectingDeepgram ? (
                        <div className="flex h-10 items-center justify-center">
                          <Loader2 className="size-6 animate-spin text-primary/60" />
                        </div>
                      ) : state === 'recording' ? (
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
                      disabled={isConnectingDeepgram}
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
                      disabled={isConnectingDeepgram}
                    >
                      <Square className="size-5 fill-current" />
                    </Button>
                  </div>
                )}

                <section className="space-y-3 border-t border-border/50 pt-6">
                  <div className="flex items-center justify-between gap-2 px-0.5">
                    <h3 className="text-sm font-bold text-foreground">Live script</h3>
                    <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                      AI diarized
                    </span>
                  </div>
                  <div className="min-h-[100px] rounded-lg border border-border bg-card p-4 shadow-sm ring-1 ring-border/40">
                    {liveLines.length === 0 && !deepgram.interimText ? (
                      <p className="text-center text-xs leading-relaxed text-muted-foreground">
                        {isConnectingDeepgram
                          ? 'Connecting to Deepgram…'
                          : state === 'paused'
                          ? 'Paused — script will continue when you resume.'
                          : 'Listening… transcript will appear as speech is detected.'}
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
                        {deepgram.interimText && (
                          <li className="flex flex-col gap-1 opacity-50">
                            <span className="px-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground/80">
                              {liveLines.at(-1)?.speaker ?? '…'}
                            </span>
                            <p className="text-sm italic leading-relaxed text-muted-foreground">
                              {deepgram.interimText}
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
                      <EmrContextTranscriptTabs
                        transcript={transcript}
                        onTranscriptChange={setTranscript}
                        emrContext={emrContext}
                        onEmrContextChange={setEmrContext}
                        transcriptId="review-transcript"
                        transcriptPlaceholder="Consultation transcript (edit if needed)"
                      />
                      <p className="text-xs text-muted-foreground">
                        Review transcript and optional context before generating the EMR
                      </p>
                    </div>
                    <Button
                      className="h-12 min-h-12 w-full bg-primary text-primary-foreground hover:bg-primary/90"
                      onClick={() =>
                        onGenerateEMR(transcript, elapsedTime, 'voice', emrContext.trim() || undefined)
                      }
                      disabled={!transcript.trim()}
                    >
                      <Sparkles className="mr-2 size-4" />
                      Generate AI Clinical Note
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 min-h-12 w-full"
                      onClick={handleCancelGenerateAndResume}
                      disabled={isConnectingDeepgram}
                    >
                      {isConnectingDeepgram ? 'Connecting…' : 'Cancel and continue recording'}
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
