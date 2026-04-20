export interface ProviderProfile {
  providerId?: string
  firstName: string
  lastName: string
  credentials?: string
  specialty: string
  email: string
  clinicId?: string | null
  divisionId?: string | null
  clinicSystem?: string | null
  clinicName: string
  siteLabel: string
}

function capitalizeToken(s: string): string {
  if (!s) return s
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

/** Demo profile derived from login username / email (aligned with home header naming). */
export function getProviderProfile(username: string): ProviderProfile {
  const raw = username.trim() || 'schen@emr.local'
  const email = raw.includes('@') ? raw : `${raw.replace(/@/g, '')}@fastdoc.health`
  const local = raw.includes('@') ? (raw.split('@')[0] ?? raw) : raw
  const tokens = local.replace(/[._-]+/g, ' ').trim().split(/\s+/).filter(Boolean)

  let firstName = 'Sarah'
  let lastName = 'Mitchell'
  if (tokens.length >= 2) {
    firstName = capitalizeToken(tokens[0])
    lastName = capitalizeToken(tokens[tokens.length - 1])
  } else if (tokens.length === 1) {
    firstName = capitalizeToken(tokens[0])
    lastName = 'Physician'
  }

  return {
    firstName,
    lastName,
    credentials: 'MD',
    specialty: 'Primary care',
    email,
    clinicName: 'Riverside Family Medicine',
    siteLabel: 'iClinic',
  }
}

export function providerDisplayName(p: ProviderProfile): string {
  const base = `${p.firstName} ${p.lastName}`.trim()
  const cred = p.credentials?.trim()
  return cred ? `${base}, ${cred}` : base
}

export function providerInitials(p: ProviderProfile): string {
  const a = p.firstName.charAt(0)
  const b = p.lastName.charAt(0)
  if (a && b) return (a + b).toUpperCase()
  return (p.firstName.slice(0, 2) || '?').toUpperCase()
}
