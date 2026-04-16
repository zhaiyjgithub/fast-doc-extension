# Deepgram WebSocket STT Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Chrome Web Speech API with Deepgram WebSocket streaming STT, getting automatic speaker diarization (Doctor/Patient) without any manual toggle.

**Architecture:** `getUserMedia` → `MediaRecorder` (WebM/Opus, 250ms chunks) → WebSocket `wss://api.deepgram.com/v1/listen` with `diarize=true`. Deepgram returns `words[].speaker` (0-indexed integers); Speaker 0 → Doctor, Speaker 1+ → Patient. A new `hooks/use-deepgram-stt.ts` hook encapsulates the entire WebSocket + MediaRecorder lifecycle. `pages/recording-page.tsx` is updated to use the new hook and the Speaker Toggle pill is removed entirely.

**Tech Stack:** Deepgram WebSocket API (nova-3, diarize), browser `MediaRecorder`, browser `WebSocket`, `import.meta.env.VITE_DEEPGRAM_API_KEY`, WXT/Vite env file loading.

---

## Codebase Context

**Workspace root:** `/Users/yuanjizhai/Desktop/project/fast-doc-extension`

**Existing files that will change:**
- `pages/recording-page.tsx` (1063 lines) — main recording UI; currently uses `useSpeechRecognition` from `hooks/use-speech-recognition.ts` and `mockLLMAttributeSpeakers` from `lib/mock-llm-speaker-attribution.ts`
- `hooks/use-speech-recognition.ts` — Chrome Web Speech hook; will be replaced (keep file, remove usages)

**New files:**
- `hooks/use-deepgram-stt.ts` — new Deepgram WebSocket + MediaRecorder hook
- `.env.example` — placeholder with `VITE_DEEPGRAM_API_KEY=`
- `env.d.ts` — TypeScript augmentation for `import.meta.env`

**Unchanged files:**
- `lib/mock-llm-speaker-attribution.ts` — no longer called from recording-page; keep as-is
- `wxt.config.ts` — WXT/Vite auto-loads `.env` files; no changes needed
- `entrypoints/sidepanel/App.tsx` — `handleGenerateEMR` currently ignores transcript; no changes

---

## Data Flow

```
Click Start → getUserMedia({ audio: true })
                ↓ stream (kept alive in micStreamRef)
         deepgram.start(stream)
                ↓
         MediaRecorder(stream, 'audio/webm;codecs=opus')
         .start(250ms)   ←── 250ms chunks
                ↓
         WebSocket.send(binaryChunk)
                ↓
  wss://api.deepgram.com/v1/listen
  ?model=nova-3&diarize=true&smart_format=true
  &interim_results=true&utterance_end_ms=1500
                ↓ JSON messages
         type="Results", is_final=true
         words: [{speaker:0, punctuated_word:"Hello"}, ...]
                ↓
         groupWordsBySpeaker(words)
         → [{speaker:0, text:"Hello how are you"}, {speaker:1, text:"I have a headache"}]
                ↓
         onFinalSegment("Hello how are you", "Doctor")
         onFinalSegment("I have a headache", "Patient")
                ↓
         liveLines: [{id, speaker:"Doctor", text, time}, ...]
                ↓ (UI)
         Live Script (no toggle, speaker auto-labeled)

Stop → deepgram.stop() → CloseStream → ws.close()
     → liveLines.map(l => `${l.speaker}: ${l.text}`).join('\n\n')
     → transcript string → processing state
```

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `.env.example` | Create | API key placeholder |
| `env.d.ts` | Create | TypeScript env type augmentation |
| `hooks/use-deepgram-stt.ts` | Create | WebSocket + MediaRecorder + diarization |
| `hooks/use-speech-recognition.ts` | Keep (unused) | Chrome STT fallback (no longer imported) |
| `pages/recording-page.tsx` | Modify | Wire new hook, remove toggle UI |
| `lib/mock-llm-speaker-attribution.ts` | Keep unchanged | No longer called |

---

## Task 1: Environment Variables

**Files:**
- Create: `.env.example`
- Create: `env.d.ts`

- [ ] **Step 1.1: Create `.env.example`**

```bash
# Deepgram API key — get from https://console.deepgram.com
# Copy this file to .env.local and fill in the value
VITE_DEEPGRAM_API_KEY=
```

- [ ] **Step 1.2: Create `env.d.ts` in project root**

```typescript
// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEEPGRAM_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

- [ ] **Step 1.3: Verify TypeScript sees the new type**

```bash
cd /Users/yuanjizhai/Desktop/project/fast-doc-extension
yarn compile 2>&1 | grep -i "deepgram\|env" || echo "No errors"
```

Expected: no errors mentioning `VITE_DEEPGRAM_API_KEY`.

- [ ] **Step 1.4: Commit**

```bash
git add .env.example env.d.ts
git commit -m "feat(env): add VITE_DEEPGRAM_API_KEY env var and TypeScript type"
```

---

## Task 2: `hooks/use-deepgram-stt.ts`

**Files:**
- Create: `hooks/use-deepgram-stt.ts`

This hook manages:
1. WebSocket connection to Deepgram
2. `MediaRecorder` lifecycle (start, pause, resume, stop)
3. KeepAlive interval (every 3s)
4. Parsing `Results` messages → grouping words by speaker → calling `onFinalSegment`
5. Exposing `interimText` for ghost line

- [ ] **Step 2.1: Create the complete hook**

```typescript
// hooks/use-deepgram-stt.ts
import * as React from 'react'

// ── Deepgram message types ─────────────────────────────────────────────────

interface DeepgramWord {
  word: string
  punctuated_word?: string
  start: number
  end: number
  confidence: number
  speaker?: number
}

interface DeepgramResultMessage {
  type: 'Results'
  is_final: boolean
  speech_final: boolean
  from_finalize?: boolean
  channel: {
    alternatives: Array<{
      transcript: string
      confidence: number
      words: DeepgramWord[]
    }>
  }
  start: number
  duration: number
}

type DeepgramMessage =
  | DeepgramResultMessage
  | { type: 'Metadata'; request_id: string }
  | { type: 'SpeechStarted'; timestamp: number }
  | { type: 'UtteranceEnd'; last_word_end: number }
  | { type: 'Error'; description: string }
  | { type: string }

// ── Types ──────────────────────────────────────────────────────────────────

export type DeepgramSTTError =
  | 'api-key-missing'
  | 'connection-failed'
  | 'recorder-failed'
  | null

export interface UseDeepgramSTTOptions {
  /** Deepgram API key (VITE_DEEPGRAM_API_KEY). Pass empty string when not yet available. */
  apiKey: string
  /** BCP-47 language code. Default: 'en-US' */
  language?: string
  /** Called for each finalized speech segment with its speaker label. */
  onFinalSegment: (text: string, speaker: 'Doctor' | 'Patient') => void
  /** Called with the current interim (non-final) transcript. Pass empty string to clear. */
  onInterimUpdate?: (text: string) => void
}

export interface UseDeepgramSTTReturn {
  /** True while the WebSocket is open and MediaRecorder is running. */
  isConnected: boolean
  /** Most recent interim transcript string (empty when none). */
  interimText: string
  /** Error state; null when healthy. */
  error: DeepgramSTTError
  /** Open WS + start MediaRecorder. Call from a click handler after getUserMedia. */
  start: (stream: MediaStream) => void
  /** Pause MediaRecorder; keep WS alive with KeepAlive messages. */
  pause: () => void
  /** Resume MediaRecorder after a pause. */
  resume: () => void
  /** Send CloseStream, stop MediaRecorder, close WS. */
  stop: () => void
  /** Hard-abort everything and reset state. */
  reset: () => void
}

// ── Speaker mapping ────────────────────────────────────────────────────────

/**
 * Deepgram speaker IDs are 0-indexed integers assigned in order of first
 * appearance. In a two-person consultation with standard turn order,
 * Speaker 0 = Doctor (speaks first / opens encounter),
 * Speaker 1 = Patient.
 */
function speakerLabel(speakerId: number): 'Doctor' | 'Patient' {
  return speakerId === 0 ? 'Doctor' : 'Patient'
}

/**
 * Group consecutive words with the same speaker into segments.
 * Falls back to speaker 0 (Doctor) if diarization is absent.
 */
function groupWordsBySpeaker(
  words: DeepgramWord[],
): Array<{ speaker: number; text: string }> {
  if (words.length === 0) return []
  const groups: Array<{ speaker: number; text: string }> = []
  let currentSpeaker = words[0]!.speaker ?? 0
  let buffer: string[] = []

  for (const word of words) {
    const ws = word.speaker ?? 0
    if (ws === currentSpeaker) {
      buffer.push(word.punctuated_word ?? word.word)
    } else {
      if (buffer.length > 0) {
        groups.push({ speaker: currentSpeaker, text: buffer.join(' ') })
      }
      currentSpeaker = ws
      buffer = [word.punctuated_word ?? word.word]
    }
  }
  if (buffer.length > 0) {
    groups.push({ speaker: currentSpeaker, text: buffer.join(' ') })
  }
  return groups
}

// ── Hook ───────────────────────────────────────────────────────────────────

const DEEPGRAM_URL = 'wss://api.deepgram.com/v1/listen'
const KEEPALIVE_INTERVAL_MS = 3000
const RECORDER_TIMESLICE_MS = 250

export function useDeepgramSTT({
  apiKey,
  language = 'en-US',
  onFinalSegment,
  onInterimUpdate,
}: UseDeepgramSTTOptions): UseDeepgramSTTReturn {
  const [isConnected, setIsConnected] = React.useState(false)
  const [interimText, setInterimText] = React.useState('')
  const [error, setError] = React.useState<DeepgramSTTError>(null)

  const wsRef = React.useRef<WebSocket | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const keepAliveRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  // Keep callbacks in refs to avoid stale closures
  const onFinalSegmentRef = React.useRef(onFinalSegment)
  React.useEffect(() => { onFinalSegmentRef.current = onFinalSegment }, [onFinalSegment])
  const onInterimUpdateRef = React.useRef(onInterimUpdate)
  React.useEffect(() => { onInterimUpdateRef.current = onInterimUpdate }, [onInterimUpdate])

  const clearKeepAlive = React.useCallback(() => {
    if (keepAliveRef.current !== null) {
      clearInterval(keepAliveRef.current)
      keepAliveRef.current = null
    }
  }, [])

  const closeWS = React.useCallback((sendClose = true) => {
    clearKeepAlive()
    const ws = wsRef.current
    if (!ws) return
    if (sendClose && ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type: 'CloseStream' })) } catch { /* ignore */ }
    }
    try { ws.close() } catch { /* ignore */ }
    wsRef.current = null
  }, [clearKeepAlive])

  const stopRecorder = React.useCallback(() => {
    const r = recorderRef.current
    if (!r) return
    try {
      if (r.state !== 'inactive') r.stop()
    } catch { /* ignore */ }
    recorderRef.current = null
  }, [])

  const reset = React.useCallback(() => {
    stopRecorder()
    closeWS(false)
    setIsConnected(false)
    setInterimText('')
    setError(null)
  }, [stopRecorder, closeWS])

  const start = React.useCallback((stream: MediaStream) => {
    if (!apiKey) {
      setError('api-key-missing')
      return
    }

    // Cleanup any previous session
    stopRecorder()
    closeWS(false)
    setError(null)
    setInterimText('')

    // Build Deepgram URL with query params
    const params = new URLSearchParams({
      model: 'nova-3',
      language,
      smart_format: 'true',
      diarize: 'true',
      punctuate: 'true',
      interim_results: 'true',
      utterance_end_ms: '1500',
      vad_events: 'true',
      // audio/webm container — Deepgram auto-detects; no encoding/sample_rate needed
    })
    // Browser WebSocket cannot set custom headers; pass API key as query param
    const url = `${DEEPGRAM_URL}?${params.toString()}&token=${apiKey}`

    const ws = new WebSocket(url)
    wsRef.current = ws

    ws.onopen = () => {
      setIsConnected(true)
      setError(null)

      // Start KeepAlive to prevent 10s idle timeout
      keepAliveRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          try { ws.send(JSON.stringify({ type: 'KeepAlive' })) } catch { /* ignore */ }
        }
      }, KEEPALIVE_INTERVAL_MS)

      // Start MediaRecorder — only after WS is open
      let recorder: MediaRecorder
      try {
        recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm;codecs=opus',
          audioBitsPerSecond: 128_000,
        })
      } catch {
        // Fallback: let browser choose
        try {
          recorder = new MediaRecorder(stream)
        } catch (err) {
          setError('recorder-failed')
          closeWS()
          return
        }
      }

      recorder.addEventListener('dataavailable', (e) => {
        if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
          ws.send(e.data)
        }
      })

      recorder.addEventListener('error', () => {
        setError('recorder-failed')
      })

      recorderRef.current = recorder
      recorder.start(RECORDER_TIMESLICE_MS)
    }

    ws.onmessage = (event) => {
      let msg: DeepgramMessage
      try {
        msg = JSON.parse(event.data as string) as DeepgramMessage
      } catch {
        return
      }

      if (msg.type !== 'Results') return
      const result = msg as DeepgramResultMessage
      const alt = result.channel.alternatives[0]
      if (!alt) return

      if (!result.is_final) {
        // Interim — just update ghost line
        const interim = alt.transcript
        setInterimText(interim)
        onInterimUpdateRef.current?.(interim)
        return
      }

      // Final result — clear interim and emit segments
      setInterimText('')
      onInterimUpdateRef.current?.('')

      const transcript = alt.transcript.trim()
      if (!transcript) return

      const hasDiarization = alt.words.length > 0 && alt.words[0]!.speaker !== undefined
      if (hasDiarization) {
        const groups = groupWordsBySpeaker(alt.words)
        for (const group of groups) {
          const text = group.text.trim()
          if (text) onFinalSegmentRef.current(text, speakerLabel(group.speaker))
        }
      } else {
        // No diarization data — emit as Doctor (fallback)
        onFinalSegmentRef.current(transcript, 'Doctor')
      }
    }

    ws.onerror = () => {
      setError('connection-failed')
      setIsConnected(false)
      clearKeepAlive()
    }

    ws.onclose = () => {
      setIsConnected(false)
      clearKeepAlive()
    }
  }, [apiKey, language, clearKeepAlive, closeWS, stopRecorder])

  const pause = React.useCallback(() => {
    const r = recorderRef.current
    if (r && r.state === 'recording') {
      try { r.pause() } catch { /* ignore */ }
    }
    // KeepAlive keeps WS open during pause
  }, [])

  const resume = React.useCallback(() => {
    const r = recorderRef.current
    if (r && r.state === 'paused') {
      try { r.resume() } catch { /* ignore */ }
    }
  }, [])

  const stop = React.useCallback(() => {
    stopRecorder()
    closeWS(true) // sends CloseStream then closes WS
    setIsConnected(false)
    setInterimText('')
  }, [stopRecorder, closeWS])

  // Cleanup on unmount
  React.useEffect(() => () => {
    stopRecorder()
    closeWS(false)
  }, [stopRecorder, closeWS])

  return { isConnected, interimText, error, start, pause, resume, stop, reset }
}
```

- [ ] **Step 2.2: Verify no lint errors**

```bash
cd /Users/yuanjizhai/Desktop/project/fast-doc-extension
yarn compile 2>&1 | head -40
```

Expected: 0 new errors related to `use-deepgram-stt.ts`.

- [ ] **Step 2.3: Commit**

```bash
git add hooks/use-deepgram-stt.ts
git commit -m "feat(hooks): add useDeepgramSTT with WebSocket streaming and speaker diarization"
```

---

## Task 3: Update `pages/recording-page.tsx`

**Files:**
- Modify: `pages/recording-page.tsx`

**Summary of all changes:**
1. Replace `useSpeechRecognition` import with `useDeepgramSTT`
2. Remove `mockLLMAttributeSpeakers`, `attributedSegmentsToTranscript`, `RawSegment` imports
3. Add `import.meta.env.VITE_DEEPGRAM_API_KEY`
4. Replace `activeSpeaker` state + `activeSpeakerRef` with nothing
5. Update `handleFinalSegment` callback (now takes `speaker` param)
6. Replace `const speech = useSpeechRecognition(...)` with `const deepgram = useDeepgramSTT(...)`
7. Remove the Chrome Speech error handler effect
8. Update `beginNewRecordingFromClick` → call `deepgram.start(stream)`
9. Update `togglePauseResume` → call `deepgram.pause()` / `deepgram.resume()`
10. Update `handleStopRecording` → call `deepgram.stop()`, build transcript directly
11. Update `resetRecordingSessionForNewPatient` → call `deepgram.reset()`
12. Remove Speaker Toggle pill JSX
13. Update `speech.interimText` → `deepgram.interimText` everywhere
14. Update error handling to use `deepgram.error`

- [ ] **Step 3.1: Replace imports at top of file**

Remove these lines (lines 3–8 approximately):
```typescript
import { useSpeechRecognition } from '@/hooks/use-speech-recognition'
import {
  mockLLMAttributeSpeakers,
  attributedSegmentsToTranscript,
  type RawSegment,
} from '@/lib/mock-llm-speaker-attribution'
```

Add in their place:
```typescript
import { useDeepgramSTT } from '@/hooks/use-deepgram-stt'

const DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY ?? ''
```

- [ ] **Step 3.2: Remove `activeSpeaker` state and `activeSpeakerRef` in the component body**

Remove these declarations (currently after `micStreamRef`):
```typescript
const activeSpeakerRef = React.useRef<'Doctor' | 'Patient'>('Doctor')
// ...
const [activeSpeaker, setActiveSpeaker] = React.useState<'Doctor' | 'Patient'>('Doctor')
```

Also remove these sync effects:
```typescript
React.useEffect(() => { activeSpeakerRef.current = activeSpeaker }, [activeSpeaker])
```

- [ ] **Step 3.3: Replace `handleFinalResult` and `speech` hook**

Remove:
```typescript
const handleFinalResult = React.useCallback((text: string) => {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  const time = formatTime(elapsedTimeRef.current)
  setLiveLines((prev) => [...prev, { id, speaker: activeSpeakerRef.current, text, time }])
}, [])

const speech = useSpeechRecognition({ onFinalResult: handleFinalResult, lang: 'en-US' })
```

Add:
```typescript
const handleFinalSegment = React.useCallback(
  (text: string, speaker: 'Doctor' | 'Patient') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const time = formatTime(elapsedTimeRef.current)
    setLiveLines((prev) => [...prev, { id, speaker, text, time }])
  },
  [],
)

const deepgram = useDeepgramSTT({
  apiKey: DEEPGRAM_API_KEY,
  language: 'en-US',
  onFinalSegment: handleFinalSegment,
})
```

- [ ] **Step 3.4: Update `beginNewRecordingFromClick`**

Replace the deps and body:
```typescript
const beginNewRecordingFromClick = React.useCallback(() => {
  if (patient == null && matchedPatient == null) {
    toast.warning('Select a patient or match a patient to this visit before recording.')
    return
  }
  if (!DEEPGRAM_API_KEY) {
    toast.error('Deepgram API key is not configured. Add VITE_DEEPGRAM_API_KEY to .env.local')
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
      setLiveLines([])
      prevLiveLineCountRef.current = 0
      setState('recording')
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
}, [patient, matchedPatient, deepgram.start])
```

- [ ] **Step 3.5: Update `togglePauseResume`**

```typescript
const togglePauseResume = React.useCallback(() => {
  if (state === 'recording') {
    deepgram.pause()
    setState('paused')
    return
  }
  // Resume: mic stream still open, just resume MediaRecorder
  deepgram.resume()
  setState('recording')
}, [state, deepgram.pause, deepgram.resume])
```

- [ ] **Step 3.6: Update `handleStopRecording`**

```typescript
const handleStopRecording = () => {
  deepgram.stop()
  stopMicStream()

  // Build transcript directly from liveLines — speakers already set by Deepgram diarization
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
```

- [ ] **Step 3.7: Update `resetRecordingSessionForNewPatient`**

In the body, replace `speech.reset()` and `setActiveSpeaker('Doctor')` with:
```typescript
deepgram.reset()
```

The `setActiveSpeaker('Doctor')` call is removed (no more manual speaker state).
The deps array changes from `[stopMicStream]` to `[stopMicStream, deepgram.reset]`.

Full updated function:
```typescript
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
  setState('ready')
  setElapsedTime(0)
  setTranscript('')
  setLiveLines([])
  setShowManualInput(false)
  setCompactRecordingHeader(false)
  prevLiveLineCountRef.current = 0
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [stopMicStream, deepgram.reset])
```

- [ ] **Step 3.8: Replace Chrome Speech error handler effect**

Remove:
```typescript
// Handle speech recognition errors (SR triggers its own mic permission flow)
React.useEffect(() => {
  if (!speech.error) return
  if (speech.error === 'microphone-denied') {
    toast.error('Microphone was blocked...')
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
```

Add:
```typescript
// Handle Deepgram connection errors
React.useEffect(() => {
  if (!deepgram.error) return
  if (deepgram.error === 'api-key-missing') {
    toast.error('Deepgram API key not set. Add VITE_DEEPGRAM_API_KEY to .env.local')
    setShowManualInput(true)
    setState('ready')
    return
  }
  if (deepgram.error === 'connection-failed') {
    toast.error('Deepgram connection failed. Check your API key and network, then try again.')
    setState('ready')
    return
  }
  if (deepgram.error === 'recorder-failed') {
    toast.error('Microphone recorder error. Try reloading the extension.')
    setState('ready')
  }
}, [deepgram.error])
```

- [ ] **Step 3.9: Remove Speaker Toggle JSX and update live script section**

Locate the live script header (around line 934):
```tsx
<div className="flex items-center justify-between gap-2 px-0.5">
  <h3 className="text-sm font-bold text-foreground">Live script</h3>
  <div className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-muted p-0.5">
    {(['Doctor', 'Patient'] as const).map((s) => (
      <button
        key={s}
        type="button"
        onClick={() => setActiveSpeaker(s)}
        className={...}
      >
        {s}
      </button>
    ))}
  </div>
</div>
```

Replace with (no toggle, add "AI diarized" badge instead):
```tsx
<div className="flex items-center justify-between gap-2 px-0.5">
  <h3 className="text-sm font-bold text-foreground">Live script</h3>
  <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
    AI diarized
  </span>
</div>
```

- [ ] **Step 3.10: Update ghost line in live script — remove `activeSpeaker` reference**

Find the ghost line that shows `{activeSpeaker}` as speaker label:
```tsx
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
```

Replace with (use last speaker from liveLines, or blank):
```tsx
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
```

Also update the empty-state check (replace `speech.interimText` with `deepgram.interimText`):
```tsx
{liveLines.length === 0 && !deepgram.interimText ? (
  <p className="text-center text-xs leading-relaxed text-muted-foreground">
    {state === 'paused'
      ? 'Paused — script will continue when you resume.'
      : 'Listening… transcript will appear as speech is detected.'}
  </p>
) : (
  <ul className="flex flex-col gap-3">
    {/* ...existing liveLines.map... */}
    {deepgram.interimText && (
      <li className="flex flex-col gap-1 opacity-50">
        <span className="...">
          {liveLines.at(-1)?.speaker ?? '…'}
        </span>
        <p className="text-sm italic leading-relaxed text-muted-foreground">
          {deepgram.interimText}
        </p>
      </li>
    )}
  </ul>
)}
```

- [ ] **Step 3.11: Build + lint verify**

```bash
cd /Users/yuanjizhai/Desktop/project/fast-doc-extension
yarn build
```

Expected: Build succeeds. No `speech` or `activeSpeaker` references remain (verify with grep):
```bash
grep -n "useSpeechRecognition\|activeSpeaker\|mockLLMAttrib\|speech\." pages/recording-page.tsx | head -20
```

Expected: 0 matches (or only `// eslint-disable` comments if any remain).

- [ ] **Step 3.12: Commit**

```bash
git add pages/recording-page.tsx
git commit -m "feat(recording): replace Chrome STT with Deepgram WebSocket, remove speaker toggle

- Import useDeepgramSTT; remove useSpeechRecognition and mock attribution
- Remove activeSpeaker state and Speaker Toggle pill
- handleFinalSegment receives (text, speaker) from Deepgram diarization
- beginNewRecordingFromClick: deepgram.start(stream) after getUserMedia
- togglePauseResume: deepgram.pause() / deepgram.resume()
- handleStopRecording: deepgram.stop(), build transcript from diarized liveLines
- Live script shows 'AI diarized' badge; ghost line uses last speaker label"
```

---

## Task 4: Final verification

**Files:**
- Read-only verification

- [ ] **Step 4.1: Full build**

```bash
cd /Users/yuanjizhai/Desktop/project/fast-doc-extension
yarn build
```

Expected: exit 0, `✔ Built extension`.

- [ ] **Step 4.2: Check no Chrome STT remnants**

```bash
grep -rn "useSpeechRecognition\|webkitSpeechRecognition\|SpeechRecognition" \
  pages/ entrypoints/ --include="*.tsx" --include="*.ts"
```

Expected: 0 matches in `pages/` and `entrypoints/`. (`hooks/use-speech-recognition.ts` itself is OK to keep.)

- [ ] **Step 4.3: Check no Speaker Toggle remnants**

```bash
grep -n "activeSpeaker\|setActiveSpeaker\|Speaker Toggle" pages/recording-page.tsx
```

Expected: 0 matches.

- [ ] **Step 4.4: Verify env var usage**

```bash
grep -n "VITE_DEEPGRAM" pages/recording-page.tsx hooks/use-deepgram-stt.ts .env.example
```

Expected: shows `DEEPGRAM_API_KEY = import.meta.env.VITE_DEEPGRAM_API_KEY` in recording-page and blank placeholder in `.env.example`.

- [ ] **Step 4.5: Create `.env.local` reminder**

Print a reminder (do not create — user must fill in their own key):
```bash
echo "⚠️  Remember: create .env.local with VITE_DEEPGRAM_API_KEY=<your-key>"
echo "   Get your key at https://console.deepgram.com"
```

- [ ] **Step 4.6: Final commit**

```bash
git add -A
git commit -m "feat(deepgram): complete Deepgram WebSocket STT migration

Tasks complete:
- VITE_DEEPGRAM_API_KEY env var + TypeScript types
- hooks/use-deepgram-stt.ts: WebSocket + MediaRecorder + diarization
- pages/recording-page.tsx: Deepgram hook, no speaker toggle, AI diarized badge"
```

---

## Self-Review

### Spec Coverage

| Requirement | Task |
|-------------|------|
| Use Deepgram WebSocket | Task 2 + 3 |
| Remove Chrome Speech API | Task 3.1 |
| Remove manual speaker toggle | Task 3.9 |
| Auto doctor/patient via diarization | Task 2 (groupWordsBySpeaker) |
| Env variable for API key | Task 1 |
| Live transcript still works | Task 3.10 |
| Pause/resume still works | Task 3.5 (deepgram.pause/resume) |

### Placeholder Scan — None found

All steps contain complete code. No TBD, TODO, or vague instructions.

### Type Consistency

- `onFinalSegment(text: string, speaker: 'Doctor' | 'Patient')` — defined in Task 2, called in Task 3 ✅
- `LiveLine.speaker: 'Doctor' | 'Patient'` — existing type, unchanged ✅
- `deepgram.start(stream: MediaStream)` — defined in Task 2, called in Task 3 ✅
- `deepgram.pause()` / `deepgram.resume()` / `deepgram.stop()` / `deepgram.reset()` — all defined in Task 2, used in Task 3 ✅
- `deepgram.interimText: string` — defined in Task 2, used in Task 3 JSX ✅
- `deepgram.error: DeepgramSTTError` — defined in Task 2, effect in Task 3 ✅

---

## Post-Implementation Notes

1. **API Key**: User must create `.env.local` (gitignored) with `VITE_DEEPGRAM_API_KEY=dg_xxx`. The key is exposed to the browser via `import.meta.env` — acceptable for a development/demo extension. For production, route through a backend proxy.
2. **Speaker assignment**: Speaker 0 = Doctor, Speaker 1 = Patient by convention. Works well when the doctor opens the consultation. If the patient speaks first, the labels will be swapped — acceptable for v1.
3. **No reconnect logic**: If the WebSocket drops mid-session, `deepgram.error` is set and state returns to `ready`. The user must tap the button again.
4. **`hooks/use-speech-recognition.ts`**: Kept in repo as fallback reference; not imported anywhere.
