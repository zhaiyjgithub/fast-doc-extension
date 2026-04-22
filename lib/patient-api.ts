import { fastdocApiBaseUrl } from './env'
import type { Patient } from '@/components/patient/patient-search-sheet'

type ParseDemographicsResult = {
  isNew: boolean
  patient: Patient
}

type ParseDemographicsRequest = {
  clinicId: string
  divisionId: string
  clinicSystem: string
  clinicName?: string | null
}

export class PatientApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'PatientApiError'
    this.status = status
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parsePatient(value: unknown): Patient {
  if (!isPlainObject(value)) {
    throw new Error('Unexpected patient payload from demographics parse API.')
  }
  const id = asTrimmedString(value.id)
  const firstName = asTrimmedString(value.first_name)
  const lastName = asTrimmedString(value.last_name)
  const dateOfBirth = asTrimmedString(value.date_of_birth) ?? ''
  if (!id || !firstName || !lastName) {
    throw new Error('Patient payload missing required fields.')
  }
  const genderRaw = asTrimmedString(value.gender)
  const gender =
    genderRaw === 'Male' || genderRaw === 'Female' || genderRaw === 'Other' ? genderRaw : undefined
  const demographicsRaw = isPlainObject(value.demographics) ? value.demographics : null
  return {
    id,
    mrn: asTrimmedString(value.mrn) ?? undefined,
    createdBy: asTrimmedString(value.created_by),
    clinicPatientId: asTrimmedString(value.clinic_patient_id),
    clinicId: asTrimmedString(value.clinic_id),
    divisionId: asTrimmedString(value.division_id),
    clinicSystem: asTrimmedString(value.clinic_system),
    clinicName: asTrimmedString(value.clinic_name),
    firstName,
    lastName,
    dateOfBirth,
    ...(gender ? { gender } : {}),
    primaryLanguage: asTrimmedString(value.primary_language),
    isActive: typeof value.is_active === 'boolean' ? value.is_active : true,
    demographics:
      demographicsRaw == null
        ? null
        : {
            phone: asTrimmedString(demographicsRaw.phone),
            email: asTrimmedString(demographicsRaw.email),
            addressLine1: asTrimmedString(demographicsRaw.address_line1),
            city: asTrimmedString(demographicsRaw.city),
            state: asTrimmedString(demographicsRaw.state),
            zipCode: asTrimmedString(demographicsRaw.zip_code),
            country: asTrimmedString(demographicsRaw.country),
          },
  }
}

function parsePayload(body: unknown): ParseDemographicsResult {
  if (!isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error('Unexpected response format from demographics parse API.')
  }
  const data = body.data
  if (typeof data.is_new !== 'boolean') {
    throw new Error('Demographics parse response missing is_new.')
  }
  return {
    isNew: data.is_new,
    patient: parsePatient(data.patient),
  }
}

export type SearchPatientsOptions = {
  q?: string
  dob?: string
  patientId?: string
  clinicPatientId?: string
  name?: string
  mrn?: string
  language?: string
  page?: number
  pageSize?: number
}

export type SearchPatientsResult = {
  items: Patient[]
  total: number
  page: number
  pageSize: number
}

export async function searchPatients(
  accessToken: string,
  options: SearchPatientsOptions = {},
): Promise<SearchPatientsResult> {
  const token = accessToken.trim()
  if (!token) throw new PatientApiError('Missing access token.')

  const params = new URLSearchParams()
  if (options.q?.trim()) params.set('q', options.q.trim())
  if (options.dob?.trim()) params.set('dob', options.dob.trim())
  if (options.patientId?.trim()) params.set('patient_id', options.patientId.trim())
  if (options.clinicPatientId?.trim()) params.set('clinic_patient_id', options.clinicPatientId.trim())
  if (options.name?.trim()) params.set('name', options.name.trim())
  if (options.mrn?.trim()) params.set('mrn', options.mrn.trim())
  if (options.language?.trim()) params.set('language', options.language.trim())
  params.set('page', String(options.page ?? 1))
  params.set('page_size', String(options.pageSize ?? 20))

  const response = await fetch(
    `${fastdocApiBaseUrl()}/patients/search?${params.toString()}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    },
  ).catch(() => {
    throw new PatientApiError('Unable to reach FastDoc patient API.')
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      isPlainObject(body) && typeof body.detail === 'string'
        ? body.detail
        : null
    throw new PatientApiError(detail ?? 'Failed to search patients.', response.status)
  }

  const data = isPlainObject(body) && isPlainObject(body.data) ? body.data : body
  const rawItems = Array.isArray(data.items) ? data.items : []
  return {
    items: rawItems.map(parsePatient),
    total: typeof data.total === 'number' ? data.total : rawItems.length,
    page: typeof data.page === 'number' ? data.page : 1,
    pageSize: typeof data.page_size === 'number' ? data.page_size : 20,
  }
}

export async function parseDemographicsTextWithLlm(
  accessToken: string,
  demographicsText: string,
  request: ParseDemographicsRequest,
): Promise<ParseDemographicsResult> {
  const token = accessToken.trim()
  const text = demographicsText.trim()
  if (!token) {
    throw new Error('Missing access token for demographics parse API.')
  }
  if (!text) {
    throw new Error('Demographics text is empty.')
  }

  const response = await fetch(`${fastdocApiBaseUrl()}/patients/parse-demographics`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
    body: JSON.stringify({
      demographics_text: text,
      clinic_id: request.clinicId,
      division_id: request.divisionId,
      clinic_system: request.clinicSystem,
      clinic_name: request.clinicName ?? undefined,
    }),
  }).catch(() => {
    throw new PatientApiError('Unable to reach FastDoc demographics parse API.')
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      isPlainObject(body) && typeof body.detail === 'string'
        ? body.detail
        : isPlainObject(body) && isPlainObject(body.data) && typeof body.data.message === 'string'
          ? body.data.message
          : null
    throw new PatientApiError(detail ?? 'Failed to parse demographics text.', response.status)
  }
  return parsePayload(body)
}

export async function getPatientById(accessToken: string, patientId: string): Promise<Patient> {
  const token = accessToken.trim()
  const id = patientId.trim()
  if (!token) {
    throw new PatientApiError('Missing access token.')
  }
  if (!id) {
    throw new PatientApiError('Missing patient ID.')
  }

  const response = await fetch(`${fastdocApiBaseUrl()}/patients/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  }).catch(() => {
    throw new PatientApiError('Unable to reach FastDoc patient API.')
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      isPlainObject(body) && typeof body.detail === 'string'
        ? body.detail
        : isPlainObject(body) && isPlainObject(body.data) && typeof body.data.message === 'string'
          ? body.data.message
          : null
    throw new PatientApiError(detail ?? 'Failed to load patient detail.', response.status)
  }

  const data = isPlainObject(body) && isPlainObject(body.data) ? body.data : body
  return parsePatient(data)
}
