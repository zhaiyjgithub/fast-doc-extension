import { fastdocApiBaseUrl } from './env'

export type SoapNote = {
  subjective: string
  objective: string
  assessment: string
  plan: string
}

export type ReportCodeEvidence = {
  evidenceRoute: string | null
  excerpt: string | null
}

export type ReportCodeSuggestion = {
  code: string
  codeType: string
  rank: number
  condition: string | null
  description: string | null
  confidence: number | null
  rationale: string | null
  status: string
  evidence: ReportCodeEvidence[]
}

export type EmrSummary = {
  noteId: string
  soapNote: SoapNote
  noteText: string | null
  isFinal: boolean
  requestId: string | null
  conversationDurationSeconds: number | null
}

export type EncounterReport = {
  encounterId: string
  emr: EmrSummary | null
  icdSuggestions: ReportCodeSuggestion[]
  cptSuggestions: ReportCodeSuggestion[]
  generatedAt: string | null
}

export class ReportApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'ReportApiError'
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

function asOptionalString(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  return asNonEmptyString(value) ?? undefined
}

function asOptionalNumber(value: unknown): number | null | undefined {
  if (value === null) {
    return null
  }
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
    return 'Encounter report was not found.'
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
    throw new Error('Report SOAP note payload is invalid.')
  }
  return {
    subjective: typeof payload.subjective === 'string' ? payload.subjective : '',
    objective: typeof payload.objective === 'string' ? payload.objective : '',
    assessment: typeof payload.assessment === 'string' ? payload.assessment : '',
    plan: typeof payload.plan === 'string' ? payload.plan : '',
  }
}

function parseCodeEvidence(payload: unknown): ReportCodeEvidence {
  if (!isPlainObject(payload)) {
    throw new Error('Report code evidence payload is invalid.')
  }
  const evidenceRoute = asOptionalString(payload.evidence_route)
  const excerpt = asOptionalString(payload.excerpt)
  if (evidenceRoute === undefined || excerpt === undefined) {
    throw new Error('Report code evidence payload is missing required fields.')
  }
  return {
    evidenceRoute,
    excerpt,
  }
}

function parseCodeSuggestion(payload: unknown): ReportCodeSuggestion {
  if (!isPlainObject(payload)) {
    throw new Error('Report code suggestion payload is invalid.')
  }

  const code = asNonEmptyString(payload.code)
  const codeType = asNonEmptyString(payload.code_type)
  const rank = typeof payload.rank === 'number' && Number.isInteger(payload.rank) ? payload.rank : null
  const condition = asOptionalString(payload.condition)
  const description = asOptionalString(payload.description)
  const confidence = asOptionalNumber(payload.confidence)
  const rationale = asOptionalString(payload.rationale)
  const status = asNonEmptyString(payload.status)
  const evidenceRaw = Array.isArray(payload.evidence) ? payload.evidence : null

  if (
    !code ||
    !codeType ||
    rank === null ||
    !status ||
    condition === undefined ||
    description === undefined ||
    confidence === undefined ||
    rationale === undefined ||
    !evidenceRaw
  ) {
    throw new Error('Report code suggestion payload is missing required fields.')
  }

  return {
    code,
    codeType,
    rank,
    condition,
    description,
    confidence,
    rationale,
    status,
    evidence: evidenceRaw.map(parseCodeEvidence),
  }
}

function parseEmrSummary(payload: unknown): EmrSummary {
  if (!isPlainObject(payload)) {
    throw new Error('Report EMR payload is invalid.')
  }

  const noteId = asNonEmptyString(payload.note_id)
  const noteText = asOptionalString(payload.note_text)
  const requestId = asOptionalString(payload.request_id)
  const duration = asOptionalNumber(payload.conversation_duration_seconds)
  const isFinal = typeof payload.is_final === 'boolean' ? payload.is_final : undefined

  if (!noteId || noteText === undefined || requestId === undefined || duration === undefined || isFinal === undefined) {
    throw new Error('Report EMR payload is missing required fields.')
  }

  return {
    noteId,
    soapNote: parseSoapNote(payload.soap_note),
    noteText,
    isFinal,
    requestId,
    conversationDurationSeconds: duration,
  }
}

function parseEncounterReport(payload: unknown): EncounterReport {
  if (!isPlainObject(payload)) {
    throw new Error('Encounter report payload is invalid.')
  }

  const encounterId = asNonEmptyString(payload.encounter_id)
  const emr = payload.emr === null ? null : parseEmrSummary(payload.emr)
  const generatedAt = asOptionalString(payload.generated_at)
  const icdRaw = Array.isArray(payload.icd_suggestions) ? payload.icd_suggestions : null
  const cptRaw = Array.isArray(payload.cpt_suggestions) ? payload.cpt_suggestions : null

  if (!encounterId || generatedAt === undefined || !icdRaw || !cptRaw) {
    throw new Error('Encounter report payload is missing required fields.')
  }

  return {
    encounterId,
    emr,
    icdSuggestions: icdRaw.map(parseCodeSuggestion),
    cptSuggestions: cptRaw.map(parseCodeSuggestion),
    generatedAt,
  }
}

async function requestReportEndpoint(
  accessToken: string,
  path: string,
  errorFallback: string,
): Promise<unknown> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access token is required.')
  }

  let response: Response
  try {
    response = await fetch(`${fastdocApiBaseUrl()}${path}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
  } catch {
    throw new ReportApiError('Unable to reach FastDoc report API.')
  }

  const body = await readBody(response)
  if (!response.ok) {
    const message = extractErrorMessage(body) ?? fallbackMessageByStatus(response.status, errorFallback)
    throw new ReportApiError(message, response.status)
  }

  return unwrapDataIfPresent(body)
}

export async function getEncounterReport(
  accessToken: string,
  encounterId: string,
): Promise<EncounterReport> {
  const id = encounterId.trim()
  if (!id) {
    throw new Error('Encounter ID is required.')
  }

  const body = await requestReportEndpoint(
    accessToken,
    `/encounters/${encodeURIComponent(id)}/report`,
    'Failed to load encounter report.',
  )

  return parseEncounterReport(body)
}
