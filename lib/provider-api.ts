import { fastdocApiBaseUrl } from './env'
import type { ProviderProfile } from './mock-provider'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return { firstName: 'Physician', lastName: '' }
  }
  if (parts.length === 1) {
    return { firstName: parts[0], lastName: '' }
  }
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(' '),
  }
}

export async function fetchProviderProfile(
  accessToken: string,
  providerId: string,
  fallbackEmail: string,
): Promise<ProviderProfile> {
  const token = accessToken.trim()
  const pid = providerId.trim()
  if (!token || !pid) {
    throw new Error('Provider profile request is missing token or provider id.')
  }

  let response: Response
  try {
    response = await fetch(`${fastdocApiBaseUrl()}/providers/${encodeURIComponent(pid)}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    })
  } catch {
    throw new Error('Unable to load provider profile right now.')
  }

  const body = await response.json().catch(() => null)
  if (!response.ok || !isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error('Provider profile response is invalid.')
  }

  const data = body.data
  const fullName = asString(data.full_name)
  const firstNameRaw = asString(data.first_name)
  const lastNameRaw = asString(data.last_name)
  const credentials = asString(data.credentials)
  const specialty = asString(data.specialty) || 'Primary care'
  const clinicId = asString(data.provider_clinic_id) || null
  const divisionId = asString(data.division_id) || null
  const clinicSystem = asString(data.clinic_system) || null
  const clinicName = asString(data.clinic_name) || 'Clinic'
  const siteLabel = clinicSystem || 'iClinic'

  const nameFromFull = splitName(fullName)
  const firstName = firstNameRaw || nameFromFull.firstName
  const lastName = lastNameRaw || nameFromFull.lastName || 'Provider'

  return {
    providerId: pid,
    firstName,
    lastName,
    credentials: credentials || undefined,
    specialty,
    email: fallbackEmail.trim(),
    clinicId,
    divisionId,
    clinicSystem,
    clinicName,
    siteLabel,
  }
}
