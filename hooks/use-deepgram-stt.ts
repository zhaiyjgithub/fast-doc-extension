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
const RECORDER_STOP_FINALIZE_MS = 500
const STOP_FINALIZE_TAIL_GRACE_MS = 250

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
  /** Bumped on intentional close and each `start`; WS handlers capture `sessionId` and no-op when stale. */
  const sessionIdRef = React.useRef(0)
  const streamRef = React.useRef<MediaStream | null>(null)
  const stopTailTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

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

  const stopStreamTracks = React.useCallback(() => {
    const s = streamRef.current
    if (!s) return
    for (const t of s.getTracks()) {
      try { t.stop() } catch { /* ignore */ }
    }
    streamRef.current = null
  }, [])

  const clearStopTailTimer = React.useCallback(() => {
    if (stopTailTimerRef.current !== null) {
      clearTimeout(stopTailTimerRef.current)
      stopTailTimerRef.current = null
    }
  }, [])

  const closeWS = React.useCallback((sendClose = true) => {
    clearKeepAlive()
    const ws = wsRef.current
    if (!ws) return
    sessionIdRef.current += 1
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
    clearStopTailTimer()
    stopRecorder()
    closeWS(false)
    stopStreamTracks()
    setIsConnected(false)
    setInterimText('')
    setError(null)
  }, [clearStopTailTimer, stopRecorder, closeWS, stopStreamTracks])

  const start = React.useCallback((stream: MediaStream) => {
    const token = apiKey.trim()
    if (!token) {
      setError('api-key-missing')
      return
    }

    // Cleanup any previous session
    stopRecorder()
    closeWS(false)
    stopStreamTracks()
    setError(null)
    setInterimText('')

    streamRef.current = stream

    sessionIdRef.current += 1
    const sessionId = sessionIdRef.current
    const isOwnedSession = () => sessionIdRef.current === sessionId

    // Build Deepgram URL with query params (token must be URL-encoded when present).
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
    const urlWithoutToken = `${DEEPGRAM_URL}?${params.toString()}`
    params.set('token', token)
    const urlWithToken = `${DEEPGRAM_URL}?${params.toString()}`

    let opened = false
    let fallbackTried = false

    const detachWs = (sock: WebSocket) => {
      sock.onopen = null
      sock.onmessage = null
      sock.onerror = null
      sock.onclose = null
    }

    const maybeFallbackToQueryToken = (failedWs: WebSocket) => {
      if (!isOwnedSession()) return
      if (wsRef.current !== failedWs) return
      if (opened || fallbackTried) return
      fallbackTried = true
      detachWs(failedWs)
      try { failedWs.close() } catch { /* ignore */ }
      connect(false)
    }

    const connect = (useSubprotocolAuth: boolean) => {
      if (!isOwnedSession()) return
      const ws = useSubprotocolAuth
        ? new WebSocket(urlWithoutToken, ['token', token])
        : new WebSocket(urlWithToken)
      if (!isOwnedSession()) {
        try { ws.close() } catch { /* ignore */ }
        return
      }
      wsRef.current = ws

      ws.onopen = () => {
        if (!isOwnedSession() || wsRef.current !== ws) return
        opened = true
        setIsConnected(true)
        setError(null)

        // Start KeepAlive to prevent 10s idle timeout
        keepAliveRef.current = setInterval(() => {
          if (!isOwnedSession() || wsRef.current !== ws) return
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
            if (!isOwnedSession() || wsRef.current !== ws) return
            setError('recorder-failed')
            setIsConnected(false)
            stopStreamTracks()
            closeWS()
            return
          }
        }

        if (!isOwnedSession() || wsRef.current !== ws) return

        recorder.addEventListener('dataavailable', (e) => {
          if (!isOwnedSession() || wsRef.current !== ws) return
          if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(e.data)
          }
        })

        recorder.addEventListener('error', () => {
          if (!isOwnedSession() || wsRef.current !== ws) return
          setError('recorder-failed')
          setIsConnected(false)
          stopRecorder()
          stopStreamTracks()
          closeWS(true)
        })

        recorderRef.current = recorder
        recorder.start(RECORDER_TIMESLICE_MS)
      }

      ws.onmessage = (event) => {
        if (!isOwnedSession() || wsRef.current !== ws) return
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
        if (!isOwnedSession() || wsRef.current !== ws) return
        if (opened) {
          stopRecorder()
          closeWS(true)
          stopStreamTracks()
          setError('connection-failed')
          setIsConnected(false)
          return
        }
        if (useSubprotocolAuth) {
          maybeFallbackToQueryToken(ws)
          return
        }
        setError('connection-failed')
        setIsConnected(false)
        stopStreamTracks()
        closeWS(false)
      }

      ws.onclose = () => {
        if (!isOwnedSession() || wsRef.current !== ws) return
        if (opened) {
          stopRecorder()
          closeWS(true)
          stopStreamTracks()
          setError('connection-failed')
          setIsConnected(false)
          return
        }
        if (useSubprotocolAuth) {
          maybeFallbackToQueryToken(ws)
          return
        }
        setError('connection-failed')
        setIsConnected(false)
        stopStreamTracks()
        closeWS(false)
      }
    }

    // Browser-recommended auth first; query `token` if handshake never opens (handles both onerror/onclose once).
    connect(true)
  }, [apiKey, language, closeWS, stopRecorder, stopStreamTracks])

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
    clearStopTailTimer()
    setIsConnected(false)
    setInterimText('')

    const scheduleTailClose = () => {
      clearStopTailTimer()
      const ws = wsRef.current
      if (ws?.readyState === WebSocket.OPEN) {
        try { ws.send(JSON.stringify({ type: 'Finalize' })) } catch { /* ignore */ }
        stopTailTimerRef.current = setTimeout(() => {
          stopTailTimerRef.current = null
          stopStreamTracks()
          closeWS(true)
        }, STOP_FINALIZE_TAIL_GRACE_MS)
      } else {
        stopStreamTracks()
        closeWS(true)
      }
    }

    const r = recorderRef.current
    if (!r || r.state === 'inactive') {
      recorderRef.current = null
      scheduleTailClose()
      return
    }
    const rec = r
    let done = false
    let timeoutId: ReturnType<typeof setTimeout>
    const finalize = () => {
      if (done) return
      done = true
      clearTimeout(timeoutId)
      rec.removeEventListener('stop', finalize)
      if (recorderRef.current !== rec) return
      recorderRef.current = null
      scheduleTailClose()
    }
    timeoutId = setTimeout(finalize, RECORDER_STOP_FINALIZE_MS)
    rec.addEventListener('stop', finalize)
    try {
      if (rec.state !== 'inactive') rec.stop()
    } catch {
      finalize()
    }
  }, [clearStopTailTimer, closeWS, stopStreamTracks])

  // Cleanup on unmount
  React.useEffect(() => () => {
    clearStopTailTimer()
    stopRecorder()
    stopStreamTracks()
    closeWS(false)
  }, [clearStopTailTimer, stopRecorder, stopStreamTracks, closeWS])

  return { isConnected, interimText, error, start, pause, resume, stop, reset }
}
