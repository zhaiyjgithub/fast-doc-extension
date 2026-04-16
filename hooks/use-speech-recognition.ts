import * as React from 'react'

interface SpeechRecognitionAlternativeLike {
  transcript: string
}

interface SpeechRecognitionResultLike {
  isFinal: boolean
  length: number
  [index: number]: SpeechRecognitionAlternativeLike
}

interface SpeechRecognitionResultListLike {
  length: number
  [index: number]: SpeechRecognitionResultLike
}

interface SpeechRecognitionEventLike extends Event {
  resultIndex: number
  results: SpeechRecognitionResultListLike
}

interface SpeechRecognitionErrorEventLike extends Event {
  error: string
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  maxAlternatives: number
  onstart: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null
  onend: ((this: SpeechRecognitionLike, ev: Event) => unknown) | null
  onerror: ((this: SpeechRecognitionLike, ev: SpeechRecognitionErrorEventLike) => unknown) | null
  onresult: ((this: SpeechRecognitionLike, ev: SpeechRecognitionEventLike) => unknown) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type SpeechRecognitionCtorLike = new () => SpeechRecognitionLike

type SpeechWindow = Window & {
  SpeechRecognition?: SpeechRecognitionCtorLike
  webkitSpeechRecognition?: SpeechRecognitionCtorLike
}

export interface UseSpeechRecognitionOptions {
  /** Called for each finalized speech segment. */
  onFinalResult: (text: string) => void
  lang?: string
}

export interface UseSpeechRecognitionReturn {
  isSupported: boolean
  isListening: boolean
  interimText: string
  error: string | null
  /** Starts recognition (mic must already be granted from a user-gesture getUserMedia). */
  start: () => void
  stop: () => void
  reset: () => void
}

export function useSpeechRecognition({
  onFinalResult,
  lang = 'en-US',
}: UseSpeechRecognitionOptions): UseSpeechRecognitionReturn {
  const SpeechRecognitionCtor =
    typeof window !== 'undefined'
      ? (((window as SpeechWindow).SpeechRecognition ??
          (window as SpeechWindow).webkitSpeechRecognition) ??
        null)
      : null
  const isSupported = SpeechRecognitionCtor !== null

  const recognitionRef = React.useRef<SpeechRecognitionLike | null>(null)
  const shouldRestartRef = React.useRef(false)
  const onFinalResultRef = React.useRef(onFinalResult)
  React.useEffect(() => {
    onFinalResultRef.current = onFinalResult
  }, [onFinalResult])

  const [isListening, setIsListening] = React.useState(false)
  const [interimText, setInterimText] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const createRecognition = React.useCallback((): SpeechRecognitionLike | null => {
    if (!SpeechRecognitionCtor) return null
    const r = new SpeechRecognitionCtor()
    r.continuous = true
    r.interimResults = true
    r.lang = lang
    r.maxAlternatives = 1

    r.onstart = () => {
      setIsListening(true)
      setError(null)
    }
    r.onend = () => {
      setIsListening(false)
      setInterimText('')
      if (shouldRestartRef.current) {
        // Small delay to avoid tight restart loop on immediate stop
        setTimeout(() => {
          if (shouldRestartRef.current && recognitionRef.current) {
            try {
              recognitionRef.current.start()
            } catch {
              // already started
            }
          }
        }, 200)
      }
    }
    r.onerror = (e: SpeechRecognitionErrorEventLike) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        shouldRestartRef.current = false
        setIsListening(false)
        setError('microphone-denied')
        return
      }
      // 'no-speech', 'audio-capture', network errors: let onend handle restart
    }
    r.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i]
        if (!result) continue
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          const trimmed = transcript.trim()
          if (trimmed) onFinalResultRef.current(trimmed)
        } else {
          interim += transcript
        }
      }
      setInterimText(interim)
    }
    return r
  }, [SpeechRecognitionCtor, lang])

  /**
   * Starts speech recognition. Call from a click handler so Chrome can show
   * the mic permission prompt for Web Speech. Avoid pre-calling getUserMedia
   * from extension side panels — it often fails even with a gesture; SR.start
   * is more reliable there.
   */
  const start = React.useCallback(() => {
    if (!isSupported) {
      setError('not-supported')
      return
    }
    shouldRestartRef.current = true
    if (!recognitionRef.current) {
      recognitionRef.current = createRecognition()
    }
    try {
      recognitionRef.current?.start()
    } catch {
      // Already running — ignore
    }
  }, [isSupported, createRecognition])

  const stop = React.useCallback(() => {
    shouldRestartRef.current = false
    try {
      recognitionRef.current?.stop()
    } catch {
      // ignore
    }
    setIsListening(false)
    setInterimText('')
  }, [])

  const reset = React.useCallback(() => {
    shouldRestartRef.current = false
    try {
      recognitionRef.current?.abort()
    } catch {
      // ignore
    }
    recognitionRef.current = null
    setIsListening(false)
    setInterimText('')
    setError(null)
  }, [])

  // Cleanup on unmount
  React.useEffect(
    () => () => {
      shouldRestartRef.current = false
      try {
        recognitionRef.current?.abort()
      } catch {
        // ignore
      }
    },
    [],
  )

  return { isSupported, isListening, interimText, error, start, stop, reset }
}
