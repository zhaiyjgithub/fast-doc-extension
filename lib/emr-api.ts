import { fastdocApiBaseUrl } from './env'
import type { SoapNote } from './report-api'

export type GenerateEmrPayload = {
  encounterId: string
  patientId: string
  providerId?: string | null
  transcript: string
  requestId?: string | null
  conversationDurationSeconds?: number | null
  source?: 'voice' | 'paste' | null
}

export type EmrCodeSuggestion = {
  code: string
  condition: string | null
  description: string | null
  confidence: number | null
  rationale: string | null
  status: string | null
}

export type GenerateEmrResult = {
  requestId: string
  encounterId: string
  patientId: string
  providerId: string | null
  soapNote: SoapNote
  emrText: string
  icdSuggestions: EmrCodeSuggestion[]
  cptSuggestions: EmrCodeSuggestion[]
}

export class EmrApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'EmrApiError'
    this.status = status
  }
}

export type EmrTaskSubmitted = {
  taskId: string
  status: 'pending'
}

export type EmrTaskStatus =
  | { taskId: string; status: 'pending' | 'running' }
  | { taskId: string; status: 'finished' }
  | { taskId: string; status: 'failed'; error: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function asOptionalString(value: unknown): string | null | undefined {
  if (value === null) return null
  if (typeof value === 'string') return value
  return undefined
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) return null
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function extractErrorMessage(body: unknown): string | null {
  if (typeof body === 'string') {
    return body.trim() || null
  }

  if (!isPlainObject(body)) {
    return null
  }

  const direct =
    asNonEmptyString(body.message) ?? asNonEmptyString(body.error) ?? asNonEmptyString(body.detail)
  if (direct) {
    return direct
  }

  if (Array.isArray(body.detail)) {
    const item = body.detail.find((entry) => isPlainObject(entry) && typeof entry.msg === 'string')
    if (item && isPlainObject(item) && typeof item.msg === 'string') {
      const msg = item.msg.trim()
      return msg || null
    }
  }

  if (isPlainObject(body.data)) {
    return extractErrorMessage(body.data)
  }

  return null
}

function fallbackMessageByStatus(status: number, fallback: string): string {
  if (status >= 500) {
    return 'FastDoc server is unavailable right now. Please try again.'
  }
  if (status === 401) {
    return 'Your session has expired. Please sign in again.'
  }
  if (status === 403) {
    return 'You do not have permission to perform this action.'
  }
  if (status === 404) {
    return 'Requested EMR endpoint was not found.'
  }
  return fallback
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text.trim()) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function unwrapDataIfPresent(body: unknown): unknown {
  if (isPlainObject(body) && Object.prototype.hasOwnProperty.call(body, 'data')) {
    return body.data
  }
  return body
}

function parseSoapNote(payload: unknown): SoapNote {
  if (!isPlainObject(payload)) {
    throw new Error('EMR SOAP payload is invalid.')
  }
  return {
    subjective: typeof payload.subjective === 'string' ? payload.subjective : '',
    objective: typeof payload.objective === 'string' ? payload.objective : '',
    assessment: typeof payload.assessment === 'string' ? payload.assessment : '',
    plan: typeof payload.plan === 'string' ? payload.plan : '',
  }
}

function parseCodeSuggestion(payload: unknown): EmrCodeSuggestion {
  if (!isPlainObject(payload)) {
    throw new Error('EMR code suggestion payload is invalid.')
  }

  const code = asNonEmptyString(payload.code)
  if (!code) {
    throw new Error('EMR code suggestion is missing required code field.')
  }

  const conditionRaw = asOptionalString(payload.condition)
  const descriptionRaw = asOptionalString(payload.description)
  const rationaleRaw = asOptionalString(payload.rationale)
  const statusRaw = asOptionalString(payload.status)

  return {
    code,
    condition: conditionRaw === undefined ? null : conditionRaw || null,
    description: descriptionRaw === undefined ? null : descriptionRaw || null,
    confidence: asOptionalNumber(payload.confidence) ?? null,
    rationale: rationaleRaw === undefined ? null : rationaleRaw || null,
    status: statusRaw === undefined ? null : statusRaw || null,
  }
}

function parseGenerateEmrResult(payload: unknown): GenerateEmrResult {
  if (!isPlainObject(payload)) {
    throw new Error('EMR generation payload is invalid.')
  }

  const requestId = asString(payload.request_id) ?? ''
  const encounterId = asNonEmptyString(payload.encounter_id)
  const patientId = asNonEmptyString(payload.patient_id)
  const providerId = asOptionalString(payload.provider_id) ?? null
  const emrText = asNonEmptyString(payload.emr_text) ?? ''
  const icdRaw = Array.isArray(payload.icd_suggestions) ? payload.icd_suggestions : []
  const cptRaw = Array.isArray(payload.cpt_suggestions) ? payload.cpt_suggestions : []

  if (!encounterId || !patientId) {
    throw new Error('EMR generation payload is missing required encounter/patient fields.')
  }

  return {
    requestId,
    encounterId,
    patientId,
    providerId,
    soapNote: isPlainObject(payload.soap_note) ? parseSoapNote(payload.soap_note) : { subjective: '', objective: '', assessment: '', plan: '' },
    emrText,
    icdSuggestions: icdRaw.map(parseCodeSuggestion),
    cptSuggestions: cptRaw.map(parseCodeSuggestion),
  }
}

async function requestEmrEndpoint(
  accessToken: string,
  path: string,
  init: RequestInit,
  errorFallback: string,
): Promise<unknown> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access token is required.')
  }

  let response: Response
  try {
    response = await fetch(`${fastdocApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      cache: 'no-store',
    })
  } catch {
    throw new EmrApiError('Unable to reach FastDoc EMR API.')
  }

  const body = await readBody(response)
  if (!response.ok) {
    const message = extractErrorMessage(body) ?? fallbackMessageByStatus(response.status, errorFallback)
    throw new EmrApiError(message, response.status)
  }

  return unwrapDataIfPresent(body)
}

export async function generateEmr(
  accessToken: string,
  payload: GenerateEmrPayload,
): Promise<EmrTaskSubmitted> {
  const encounterId = payload.encounterId?.trim()
  const patientId = payload.patientId?.trim()
  const transcript = payload.transcript?.trim()

  if (!encounterId) throw new Error('Encounter ID is required for EMR generation.')
  if (!patientId) throw new Error('Patient ID is required for EMR generation.')
  if (!transcript) throw new Error('Transcript is required for EMR generation.')

  const body = await requestEmrEndpoint(
    accessToken,
    '/emr/generate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        encounter_id: encounterId,
        patient_id: patientId,
        provider_id: payload.providerId?.trim() || undefined,
        transcript,
        request_id: payload.requestId?.trim() || undefined,
        conversation_duration_seconds: payload.conversationDurationSeconds ?? undefined,
        source: payload.source ?? undefined,
      }),
    },
    'Failed to submit EMR generation.',
  )

  if (!isPlainObject(body)) throw new EmrApiError('Invalid task submission response.')
  const taskId = asNonEmptyString(body.task_id)
  if (!taskId) throw new EmrApiError('Missing task_id in response.')
  return { taskId, status: 'pending' }
}

export async function pollEmrTask(
  accessToken: string,
  taskId: string,
): Promise<EmrTaskStatus> {
  const body = await requestEmrEndpoint(
    accessToken,
    `/emr/task/${taskId}`,
    { method: 'GET' },
    'Failed to poll EMR task status.',
  )

  if (!isPlainObject(body)) throw new EmrApiError('Invalid task poll response.')
  const taskStatus = asNonEmptyString(body.status)
  if (!taskStatus) throw new EmrApiError('Missing status in task poll response.')

  if (taskStatus === 'finished') {
    return { taskId, status: 'finished' }
  }
  if (taskStatus === 'failed') {
    return { taskId, status: 'failed', error: asNonEmptyString(body.error) ?? 'Unknown error' }
  }
  if (taskStatus !== 'pending' && taskStatus !== 'running') {
    throw new EmrApiError(`Unexpected task status: ${taskStatus}`)
  }
  return { taskId, status: taskStatus }
}
