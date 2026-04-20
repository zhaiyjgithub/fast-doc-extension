import { fastdocApiBaseUrl } from './env'

type ParsedDemographicsPayload = {
  firstName: string
  lastName: string
  dateOfBirth: string | null
  gender: 'Male' | 'Female' | 'Other' | null
  primaryLanguage: string | null
  clinicPatientId: string | null
  demographics: {
    phone?: string | null
    email?: string | null
    addressLine1?: string | null
    city?: string | null
    state?: string | null
    zipCode?: string | null
  } | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function parsePayload(body: unknown): ParsedDemographicsPayload {
  if (!isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error('Unexpected response format from demographics parse API.')
  }
  const data = body.data
  const firstName = asTrimmedString(data.first_name)
  const lastName = asTrimmedString(data.last_name)
  if (!firstName || !lastName) {
    throw new Error('Demographics parse response missing patient name.')
  }

  const dateOfBirth = asTrimmedString(data.date_of_birth)
  const genderRaw = asTrimmedString(data.gender)
  const gender =
    genderRaw === 'Male' || genderRaw === 'Female' || genderRaw === 'Other' ? genderRaw : null

  const demographicsRaw = isPlainObject(data.demographics) ? data.demographics : null

  return {
    firstName,
    lastName,
    dateOfBirth,
    gender,
    primaryLanguage: asTrimmedString(data.primary_language),
    clinicPatientId: asTrimmedString(data.clinic_patient_id),
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
          },
  }
}

export async function parseDemographicsTextWithLlm(
  accessToken: string,
  demographicsText: string,
): Promise<ParsedDemographicsPayload> {
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
    body: JSON.stringify({ demographics_text: text }),
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
