import { fastdocApiBaseUrl } from './env'

export type WeeklyRecentPatient = {
  encounterId: string
  initials: string
}

export type WeeklyInsight = {
  weekStart: string
  weekEnd: string
  prevWeekStart: string
  prevWeekEnd: string
  notesCompletedThisWeek: number
  notesCompletedLastWeek: number
  avgCompletionHoursThisWeek: number | null
  avgCompletionHoursLastWeek: number | null
  completionTimeChangePercent: number | null
  paceDirection: 'faster' | 'slower' | 'same' | 'unknown'
  notesThroughputChangePercent: number | null
  recentCompletedPatients: WeeklyRecentPatient[]
}

export class AnalyticsApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AnalyticsApiError'
    this.status = status
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t || null
}

function asNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  return value
}

function extractErrorMessage(body: unknown): string | null {
  if (typeof body === 'string') return body.trim() || null
  if (!isPlainObject(body)) return null
  const d = body.detail
  if (typeof d === 'string') return d.trim() || null
  return null
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) return null
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function parseRecentCompletedPatients(payload: unknown): WeeklyRecentPatient[] {
  if (!Array.isArray(payload)) {
    throw new Error('Weekly insight recent_completed_patients is invalid.')
  }
  const out: WeeklyRecentPatient[] = []
  for (const item of payload) {
    if (!isPlainObject(item)) {
      throw new Error('Weekly insight recent patient entry is invalid.')
    }
    const encounterId = asNonEmptyString(item.encounter_id)
    const rawInitials = typeof item.initials === 'string' ? item.initials.trim() : ''
    const initials = rawInitials ? rawInitials.slice(0, 4).toUpperCase() : '?'
    if (!encounterId) {
      throw new Error('Weekly insight recent patient entry is missing encounter_id.')
    }
    out.push({ encounterId, initials })
  }
  if (out.length > 5) {
    return out.slice(0, 5)
  }
  return out
}

function parseWeeklyInsight(payload: unknown): WeeklyInsight {
  if (!isPlainObject(payload)) {
    throw new Error('Weekly insight payload is invalid.')
  }

  const weekStart = asNonEmptyString(payload.week_start)
  const weekEnd = asNonEmptyString(payload.week_end)
  const prevWeekStart = asNonEmptyString(payload.prev_week_start)
  const prevWeekEnd = asNonEmptyString(payload.prev_week_end)
  const notesThis = asNumber(payload.notes_completed_this_week)
  const notesLast = asNumber(payload.notes_completed_last_week)
  const avgThis = asOptionalNumber(payload.avg_completion_hours_this_week)
  const avgLast = asOptionalNumber(payload.avg_completion_hours_last_week)
  const pacePct = asOptionalNumber(payload.completion_time_change_percent)
  const paceDir = payload.pace_direction
  const throughputPct = asOptionalNumber(payload.notes_throughput_change_percent)
  if (!Array.isArray(payload.recent_completed_patients)) {
    throw new Error('Weekly insight payload is missing recent_completed_patients.')
  }
  const recentCompletedPatients = parseRecentCompletedPatients(payload.recent_completed_patients)

  const paceOk =
    paceDir === 'faster' || paceDir === 'slower' || paceDir === 'same' || paceDir === 'unknown'

  if (
    !weekStart ||
    !weekEnd ||
    !prevWeekStart ||
    !prevWeekEnd ||
    notesThis === null ||
    notesLast === null ||
    !paceOk ||
    avgThis === undefined ||
    avgLast === undefined ||
    pacePct === undefined ||
    throughputPct === undefined
  ) {
    throw new Error('Weekly insight payload is missing required fields.')
  }

  return {
    weekStart,
    weekEnd,
    prevWeekStart,
    prevWeekEnd,
    notesCompletedThisWeek: notesThis,
    notesCompletedLastWeek: notesLast,
    avgCompletionHoursThisWeek: avgThis,
    avgCompletionHoursLastWeek: avgLast,
    completionTimeChangePercent: pacePct,
    paceDirection: paceDir,
    notesThroughputChangePercent: throughputPct,
    recentCompletedPatients,
  }
}

export async function getWeeklyInsight(accessToken: string): Promise<WeeklyInsight> {
  const token = accessToken.trim()
  if (!token) throw new Error('Access token is required.')

  let response: Response
  try {
    response = await fetch(`${fastdocApiBaseUrl()}/analytics/weekly-insight`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    })
  } catch {
    throw new AnalyticsApiError('Unable to reach FastDoc analytics API.')
  }

  const body = await readBody(response)
  if (!response.ok) {
    const msg =
      extractErrorMessage(body) ??
      (response.status >= 500
        ? 'FastDoc server is unavailable right now. Please try again.'
        : 'Failed to load weekly insight.')
    throw new AnalyticsApiError(msg, response.status)
  }

  return parseWeeklyInsight(body)
}
