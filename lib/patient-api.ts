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
    throw new Error('Unable to reach FastDoc demographics parse API.')
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const detail =
      isPlainObject(body) && typeof body.detail === 'string'
        ? body.detail
        : isPlainObject(body) && isPlainObject(body.data) && typeof body.data.message === 'string'
          ? body.data.message
          : null
    throw new Error(detail ?? 'Failed to parse demographics text.')
  }
  return parsePayload(body)
}
