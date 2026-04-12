import type { Encounter } from '@/lib/mock-encounters'
import { MOCK_ENCOUNTERS } from '@/lib/mock-encounters'

export interface PatientDemographic {
  encounterId: string
  firstName: string
  lastName: string
  gender: Encounter['gender']
  /** ISO yyyy-MM-dd */
  dobIso: string
  mobilePhone: string
  email: string
  address: string
  city: string
  state: string
  zipCode: string
  insuranceId: string
  insuranceName: string
  displayName: string
  initials: string
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: '', lastName: '' }
  if (parts.length === 1) return { firstName: parts[0], lastName: '' }
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  }
}

const CITIES = ['Springfield', 'Rivertown', 'Lakeview', 'Maple City'] as const
const STATES = ['CA', 'TX', 'NY', 'WA'] as const
const PLANS = ['BlueCross Demo', 'UnitedHealth Demo', 'Aetna Demo', 'Cigna Demo'] as const

export function encounterToDemographic(e: Encounter): PatientDemographic {
  const { firstName, lastName } = splitFullName(e.name)
  const n = Number(e.id) || 0
  const idx = Math.max(0, n - 1) % CITIES.length
  const emailLocal = [firstName, lastName]
    .filter(Boolean)
    .join('.')
    .toLowerCase()
    .replace(/\s+/g, '.')
  return {
    encounterId: e.id,
    firstName,
    lastName,
    gender: e.gender,
    dobIso: e.dob,
    mobilePhone: `(555) 20${e.id}-884${e.id}`,
    email: `${emailLocal || 'patient'}@patient.demo`,
    address: `${100 + n * 17} Oak Grove Ave`,
    city: CITIES[idx],
    state: STATES[idx],
    zipCode: `9${e.id}1${e.id}0`,
    insuranceId: `INS-${e.id}-884210`,
    insuranceName: PLANS[idx],
    displayName: e.name,
    initials: e.initials,
  }
}

export function getDemographicByEncounterId(encounterId: string): PatientDemographic | null {
  const e = MOCK_ENCOUNTERS.find((x) => x.id === encounterId)
  return e ? encounterToDemographic(e) : null
}
