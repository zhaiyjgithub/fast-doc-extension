import { format, isValid, parse } from 'date-fns'
import type { Patient } from '@/components/patient/patient-search-sheet'

/**
 * Best-effort parse of flattened EMR demographics text (e.g. MDLand office visit)
 * into a {@link Patient} for the recording UI.
 */
export function parsePatientFromDemographicsText(demographicsText: string): Patient | null {
  const normalized = demographicsText.replace(/\s+/g, ' ').trim()
  if (!normalized) return null

  const dobMatch = normalized.match(/\bDOB:\s*(\d{1,2}\/\d{1,2}\/\d{4})\b/i)
  if (!dobMatch?.[1]) return null

  const dobParsed = parse(dobMatch[1], 'MM/dd/yyyy', new Date())
  if (!isValid(dobParsed)) return null
  const dobIso = format(dobParsed, 'yyyy-MM-dd')

  const nameMatch =
    normalized.match(/\bName:\s*(.+?)\s+DOB:/i) ?? normalized.match(/\bEdit Name:\s*(.+?)\s+DOB:/i)
  const name = nameMatch?.[1]?.trim().replace(/\s+Edit$/i, '').trim() || 'Unknown patient'

  const genderMatch = normalized.match(/\bGender:\s*(Male|Female|Other)\b/i)
  const gender = genderMatch?.[1] as Patient['gender'] | undefined

  const idMatch = normalized.match(/\bPatient\s*ID:\s*([^\s]+)/i)
  const idNumber = idMatch?.[1]?.trim()

  const id = idNumber != null && idNumber.length > 0 ? `emr-${idNumber}` : `emr-${dobIso}-${Date.now()}`

  return {
    id,
    name,
    dob: dobIso,
    ...(gender === 'Male' || gender === 'Female' || gender === 'Other' ? { gender } : {}),
    ...(idNumber ? { idNumber: `Patient ID ${idNumber}` } : {}),
  }
}
