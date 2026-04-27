import { fastdocApiBaseUrl } from './env'

export type EncounterSummary = {
  id: string
  patientId: string
  patientFirstName: string | null
  patientLastName: string | null
  patientDateOfBirth: string | null
  patientGender: string | null
  patientDisplayId: string | null
  providerId: string | null
  encounterTime: string
  careSetting: string
  chiefComplaint: string | null
  status: string
  hasTranscript: boolean
  transcriptText: string | null
  latestEmr: Record<string, unknown> | null
  emrSource: string | null
  /** ISO 8601 from `emr_updated_at`; null if no EMR note. */
  emrUpdatedAt: string | null
}

export type CreateEncounterPayload = {
  patientId: string
  providerId?: string | null
  encounterTime?: string | null
  careSetting?: string | null
  chiefComplaint?: string | null
}

export type ListEncountersOptions = {
  page?: number
  pageSize?: number
  todayOnly?: boolean
}

export type SearchEncountersOptions = {
  q?: string
  name?: string
  dob?: string
  mrn?: string
  patientId?: string
  clinicPatientId?: string
  language?: string
  page?: number
  pageSize?: number
}

export class EncounterApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'EncounterApiError'
    this.status = status
  }
}

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

function asOptionalNullableString(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  return typeof value === 'string' ? value : undefined
}

function asOptionalDateString(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

function asOptionalRecord(value: unknown): Record<string, unknown> | null | undefined {
  if (value === null) {
    return null
  }
  return isPlainObject(value) ? value : undefined
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
    return 'Requested encounter was not found.'
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

function parseEncounterSummary(payload: unknown): EncounterSummary {
  if (!isPlainObject(payload)) {
    throw new Error('Encounter response payload is invalid.')
  }

  const id = asNonEmptyString(payload.id)
  const patientId = asNonEmptyString(payload.patient_id)
  const patientFirstName = asOptionalNullableString(payload.patient_first_name)
  const patientLastName = asOptionalNullableString(payload.patient_last_name)
  const patientDateOfBirth = asOptionalDateString(payload.patient_date_of_birth)
  const patientGender = asOptionalNullableString(payload.patient_gender)
  const patientDisplayId = asOptionalNullableString(payload.patient_display_id)
  const providerId = asOptionalNullableString(payload.provider_id)
  const encounterTime = asNonEmptyString(payload.encounter_time)
  const careSetting = asNonEmptyString(payload.care_setting)
  const chiefComplaint = asOptionalNullableString(payload.chief_complaint)
  const status = asNonEmptyString(payload.status)
  const transcriptText = asOptionalNullableString(payload.transcript_text)
  const latestEmr = asOptionalRecord(payload.latest_emr)
  const emrSource = asOptionalNullableString(payload.emr_source)
  const emrUpdatedAt = asOptionalNullableString(payload.emr_updated_at) ?? null
  const hasTranscript = typeof payload.has_transcript === 'boolean' ? payload.has_transcript : undefined

  if (
    !id ||
    !patientId ||
    !encounterTime ||
    !careSetting ||
    !status ||
    patientFirstName === undefined ||
    patientLastName === undefined ||
    patientDateOfBirth === undefined ||
    patientGender === undefined ||
    patientDisplayId === undefined ||
    providerId === undefined ||
    chiefComplaint === undefined ||
    transcriptText === undefined ||
    latestEmr === undefined ||
    emrSource === undefined ||
    hasTranscript === undefined
  ) {
    throw new Error('Encounter response payload is missing required fields.')
  }

  return {
    id,
    patientId,
    patientFirstName,
    patientLastName,
    patientDateOfBirth,
    patientGender,
    patientDisplayId,
    providerId,
    encounterTime,
    careSetting,
    chiefComplaint,
    status,
    hasTranscript,
    transcriptText,
    latestEmr,
    emrSource,
    emrUpdatedAt,
  }
}

async function requestEncounterEndpoint(
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
    throw new EncounterApiError('Unable to reach FastDoc encounter API.')
  }

  const body = await readBody(response)
  if (!response.ok) {
    const message = extractErrorMessage(body) ?? fallbackMessageByStatus(response.status, errorFallback)
    throw new EncounterApiError(message, response.status)
  }

  return unwrapDataIfPresent(body)
}

export async function createEncounter(
  accessToken: string,
  payload: CreateEncounterPayload,
): Promise<EncounterSummary> {
  const patientId = payload.patientId?.trim()
  if (!patientId) {
    throw new Error('Patient ID is required to create an encounter.')
  }

  const body = await requestEncounterEndpoint(
    accessToken,
    '/encounters',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patient_id: patientId,
        provider_id: payload.providerId?.trim() || undefined,
        encounter_time: payload.encounterTime?.trim() || undefined,
        care_setting: payload.careSetting?.trim() || undefined,
        chief_complaint: payload.chiefComplaint?.trim() || undefined,
      }),
    },
    'Failed to create encounter.',
  )

  return parseEncounterSummary(body)
}

export async function listEncounters(
  accessToken: string,
  opts: ListEncountersOptions = {},
): Promise<EncounterSummary[]> {
  const params = new URLSearchParams()
  if (typeof opts.page === 'number') {
    params.set('page', String(opts.page))
  }
  if (typeof opts.pageSize === 'number') {
    params.set('page_size', String(opts.pageSize))
  }
  if (typeof opts.todayOnly === 'boolean') {
    params.set('today_only', String(opts.todayOnly))
  }

  const query = params.toString()
  const body = await requestEncounterEndpoint(
    accessToken,
    `/encounters${query ? `?${query}` : ''}`,
    {
      method: 'GET',
    },
    'Failed to load encounters.',
  )

  if (!Array.isArray(body)) {
    throw new Error('Encounter list response payload is invalid.')
  }

  return body.map(parseEncounterSummary)
}

export async function getEncounter(
  accessToken: string,
  encounterId: string,
): Promise<EncounterSummary> {
  const id = encounterId.trim()
  if (!id) {
    throw new Error('Encounter ID is required.')
  }

  const body = await requestEncounterEndpoint(
    accessToken,
    `/encounters/${encodeURIComponent(id)}`,
    {
      method: 'GET',
    },
    'Failed to load encounter.',
  )

  return parseEncounterSummary(body)
}

export async function searchEncounters(
  accessToken: string,
  opts: SearchEncountersOptions = {},
): Promise<EncounterSummary[]> {
  const params = new URLSearchParams()
  if (opts.q?.trim()) params.set('q', opts.q.trim())
  if (opts.name?.trim()) params.set('name', opts.name.trim())
  if (opts.dob?.trim()) params.set('dob', opts.dob.trim())
  if (opts.mrn?.trim()) params.set('mrn', opts.mrn.trim())
  if (opts.patientId?.trim()) params.set('patient_id', opts.patientId.trim())
  if (opts.clinicPatientId?.trim()) params.set('clinic_patient_id', opts.clinicPatientId.trim())
  if (opts.language?.trim()) params.set('language', opts.language.trim())
  if (typeof opts.page === 'number') params.set('page', String(opts.page))
  if (typeof opts.pageSize === 'number') params.set('page_size', String(opts.pageSize))

  const query = params.toString()
  const body = await requestEncounterEndpoint(
    accessToken,
    `/encounters/search${query ? `?${query}` : ''}`,
    { method: 'GET' },
    'Failed to search encounters.',
  )

  if (!Array.isArray(body)) {
    throw new Error('Encounter search response payload is invalid.')
  }
  return body.map(parseEncounterSummary)
}
