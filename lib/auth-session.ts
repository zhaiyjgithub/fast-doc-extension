import type { AuthUser, PersistedAuthSession } from './auth-types'

const AUTH_SESSION_KEY = 'fastdoc.auth.session'

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

function isAuthUser(value: unknown): value is AuthUser {
  if (!isPlainObject(value)) {
    return false
  }

  const userId = asNonEmptyString(value.userId)
  const email = asNonEmptyString(value.email)
  const userType = value.userType
  const providerId = value.providerId === null ? null : asNonEmptyString(value.providerId)

  return (
    !!userId &&
    !!email &&
    (userType === 'doctor' || userType === 'admin') &&
    (providerId === null || !!providerId)
  )
}

function isPersistedAuthSession(value: unknown): value is PersistedAuthSession {
  if (!isPlainObject(value)) {
    return false
  }

  const accessToken = asNonEmptyString(value.accessToken)
  const refreshToken = asNonEmptyString(value.refreshToken)
  const username = asNonEmptyString(value.username)

  return !!accessToken && !!refreshToken && !!username && isAuthUser(value.user)
}

export async function loadAuthSession(): Promise<PersistedAuthSession | null> {
  const result = await browser.storage.local.get(AUTH_SESSION_KEY)
  const raw = result as Record<string, unknown>
  const maybeSession = raw[AUTH_SESSION_KEY]

  if (!isPersistedAuthSession(maybeSession)) {
    if (Object.prototype.hasOwnProperty.call(raw, AUTH_SESSION_KEY)) {
      await browser.storage.local.remove(AUTH_SESSION_KEY)
    }
    return null
  }

  return maybeSession
}

export async function saveAuthSession(session: PersistedAuthSession): Promise<void> {
  if (!isPersistedAuthSession(session)) {
    throw new Error('Cannot persist malformed auth session.')
  }

  await browser.storage.local.set({
    [AUTH_SESSION_KEY]: session,
  })
}

export async function clearAuthSession(): Promise<void> {
  await browser.storage.local.remove(AUTH_SESSION_KEY)
}
