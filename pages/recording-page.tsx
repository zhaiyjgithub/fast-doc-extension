import * as React from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Mic, MicOff, Square, Play, Pause } from 'lucide-react'
import { cn } from '@/lib/utils'

type RecordingState = 'idle' | 'recording' | 'paused' | 'done'

interface Transcript {
  id: string
  speaker: '医生' | '患者'
  text: string
  time: string
}

const MOCK_TRANSCRIPT: Transcript[] = [
  { id: '1', speaker: '医生', text: '您好，请说说您的主要不适。', time: '00:05' },
  { id: '2', speaker: '患者', text: '我头痛了三天，昨天开始发烧，最高38度5。', time: '00:10' },
  { id: '3', speaker: '医生', text: '有没有咳嗽、流鼻涕或咽痛？', time: '00:18' },
  { id: '4', speaker: '患者', text: '没有咳嗽，就是头痛很厉害，特别是额头这里。', time: '00:25' },
]

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

interface RecordingPageProps {
  patientId?: string
}

export function RecordingPage({ patientId: _patientId }: RecordingPageProps) {
  const [state, setState] = React.useState<RecordingState>('idle')
  const [duration, setDuration] = React.useState(0)
  const [transcript, setTranscript] = React.useState<Transcript[]>([])
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  React.useEffect(() => {
    if (state === 'recording') {
      timerRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
      // Simulate transcript lines appearing
      const t1 = setTimeout(() => setTranscript(MOCK_TRANSCRIPT.slice(0, 1)), 1500)
      const t2 = setTimeout(() => setTranscript(MOCK_TRANSCRIPT.slice(0, 2)), 3000)
      const t3 = setTimeout(() => setTranscript(MOCK_TRANSCRIPT.slice(0, 3)), 5000)
      const t4 = setTimeout(() => setTranscript(MOCK_TRANSCRIPT.slice(0, 4)), 7000)
      return () => {
        clearInterval(timerRef.current!)
        clearTimeout(t1)
        clearTimeout(t2)
        clearTimeout(t3)
        clearTimeout(t4)
      }
    } else {
      clearInterval(timerRef.current!)
    }
  }, [state])

  function handleStart() {
    setState('recording')
    setDuration(0)
    setTranscript([])
  }

  function handlePause() {
    setState('paused')
  }

  function handleResume() {
    setState('recording')
  }

  function handleStop() {
    setState('done')
    clearInterval(timerRef.current!)
    setTranscript(MOCK_TRANSCRIPT)
  }

  return (
    <div className="flex h-full flex-col">
      {/* Recording control zone */}
      <div className="flex shrink-0 flex-col items-center gap-4 border-b border-border px-4 py-6">
        {/* Pulsing mic indicator */}
        <div
          className={cn(
            'flex h-20 w-20 items-center justify-center rounded-full transition-all',
            state === 'recording'
              ? 'animate-pulse bg-destructive/10 text-destructive'
              : state === 'paused'
              ? 'bg-warning/10 text-warning'
              : state === 'done'
              ? 'bg-primary/10 text-primary'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {state === 'recording' ? (
            <Mic className="h-8 w-8" />
          ) : state === 'paused' ? (
            <Pause className="h-8 w-8" />
          ) : state === 'done' ? (
            <Play className="h-8 w-8" />
          ) : (
            <MicOff className="h-8 w-8" />
          )}
        </div>

        {/* Timer */}
        <span className="font-mono text-2xl font-semibold tabular-nums">
          {formatDuration(duration)}
        </span>

        {/* State badge */}
        {state !== 'idle' && (
          <Badge
            variant={
              state === 'recording'
                ? 'destructive'
                : state === 'paused'
                ? 'outline'
                : 'default'
            }
          >
            {state === 'recording' ? '录音中' : state === 'paused' ? '已暂停' : '已完成'}
          </Badge>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          {state === 'idle' && (
            <Button onClick={handleStart} size="lg">
              <Mic className="mr-2 h-4 w-4" />
              开始录音
            </Button>
          )}
          {state === 'recording' && (
            <>
              <Button variant="outline" onClick={handlePause}>
                <Pause className="mr-2 h-4 w-4" />
                暂停
              </Button>
              <Button variant="destructive" onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" />
                停止
              </Button>
            </>
          )}
          {state === 'paused' && (
            <>
              <Button onClick={handleResume}>
                <Play className="mr-2 h-4 w-4" />
                继续
              </Button>
              <Button variant="destructive" onClick={handleStop}>
                <Square className="mr-2 h-4 w-4" />
                停止
              </Button>
            </>
          )}
          {state === 'done' && (
            <Button variant="outline" onClick={() => { setState('idle'); setDuration(0); setTranscript([]) }}>
              重新录音
            </Button>
          )}
        </div>
      </div>

      {/* Transcript */}
      <div className="flex-1 overflow-hidden">
        {transcript.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {state === 'idle' ? '点击开始录音后将显示转录内容' : '等待转录…'}
          </div>
        ) : (
          <ScrollArea className="h-full">
            <div className="space-y-3 px-4 py-3">
              {transcript.map((line) => (
                <div
                  key={line.id}
                  className={cn(
                    'flex gap-2',
                    line.speaker === '医生' ? 'justify-start' : 'justify-end flex-row-reverse',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm',
                      line.speaker === '医生'
                        ? 'rounded-tl-sm bg-muted'
                        : 'rounded-tr-sm bg-primary/10',
                    )}
                  >
                    <p className="mb-0.5 text-xs font-medium text-muted-foreground">
                      {line.speaker} · {line.time}
                    </p>
                    <p>{line.text}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  )
}
