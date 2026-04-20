import { fastdocApiBaseUrl } from './env'
import type {
  AuthTokens,
  AuthUser,
  AuthUserType,
  ProviderAuthLoginResponseData,
  ProviderAuthMeResponseData,
} from './auth-types'

export type LoginResult = AuthTokens & {
  tokenType: string
  userId: string
  userType: AuthUserType
  providerId: string | null
}

export class AuthApiError extends Error {
  status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AuthApiError'
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
    return fallback
  }
  if (status === 403) {
    return 'You do not have permission to perform this action.'
  }
  if (status === 404) {
    return 'Requested auth endpoint was not found.'
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

function ensureWrappedDataObject(body: unknown): Record<string, unknown> {
  if (!isPlainObject(body) || !isPlainObject(body.data)) {
    throw new Error('Unexpected response format from FastDoc auth API.')
  }
  return body.data
}

function parseOptionalId(value: unknown): string | null | undefined {
  if (value === null) {
    return null
  }
  return asNonEmptyString(value) ?? undefined
}

function toLoginResult(payload: ProviderAuthLoginResponseData): LoginResult {
  const accessToken = asNonEmptyString(payload.access_token)
  const refreshToken = asNonEmptyString(payload.refresh_token)
  const tokenType = asNonEmptyString(payload.token_type)
  const userId = asNonEmptyString(payload.user_id)
  const providerId = parseOptionalId(payload.provider_id)

  if (
    !accessToken ||
    !refreshToken ||
    !tokenType ||
    !userId ||
    (payload.user_type !== 'doctor' && payload.user_type !== 'admin') ||
    providerId === undefined
  ) {
    throw new Error('FastDoc auth login response is missing required fields.')
  }

  return {
    accessToken,
    refreshToken,
    tokenType,
    userId,
    userType: payload.user_type,
    providerId,
  }
}

function toAuthUser(payload: ProviderAuthMeResponseData): AuthUser {
  const userId = asNonEmptyString(payload.user_id)
  const email = asNonEmptyString(payload.email)
  const providerId = parseOptionalId(payload.provider_id)

  if (
    !userId ||
    !email ||
    (payload.user_type !== 'doctor' && payload.user_type !== 'admin') ||
    providerId === undefined
  ) {
    throw new Error('FastDoc user profile response is missing required fields.')
  }

  return {
    userId,
    email,
    userType: payload.user_type,
    providerId,
  }
}

async function requestAuthEndpoint(
  path: string,
  init: RequestInit,
  errorFallback: string,
): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${fastdocApiBaseUrl()}${path}`, {
      ...init,
      cache: 'no-store',
    })
  } catch {
    throw new AuthApiError('Unable to reach FastDoc. Check your network and API URL settings.')
  }
  const body = await readBody(response)

  if (!response.ok) {
    const message =
      extractErrorMessage(body) ?? fallbackMessageByStatus(response.status, errorFallback)
    throw new AuthApiError(message, response.status)
  }

  return ensureWrappedDataObject(body)
}

export async function loginWithPassword(email: string, password: string): Promise<LoginResult> {
  const username = email.trim()
  if (!username || !password) {
    throw new Error('Email and password are required.')
  }

  const form = new URLSearchParams()
  form.set('username', username)
  form.set('password', password)

  const data = await requestAuthEndpoint(
    '/auth/login',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: form.toString(),
    },
    'Invalid email or password.',
  )

  return toLoginResult(data as ProviderAuthLoginResponseData)
}

export async function refreshProviderToken(refreshToken: string): Promise<LoginResult> {
  const token = refreshToken.trim()
  if (!token) {
    throw new Error('Refresh token is required.')
  }

  const data = await requestAuthEndpoint(
    '/auth/refresh',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: token }),
    },
    'Your session has expired. Please sign in again.',
  )

  return toLoginResult(data as ProviderAuthLoginResponseData)
}

export async function fetchCurrentUser(accessToken: string): Promise<AuthUser> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access token is required.')
  }

  const data = await requestAuthEndpoint(
    '/auth/me',
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    'Unable to verify your session. Please sign in again.',
  )

  return toAuthUser(data as ProviderAuthMeResponseData)
}

export async function logoutProvider(accessToken: string): Promise<void> {
  const token = accessToken.trim()
  if (!token) {
    throw new Error('Access token is required.')
  }

  await requestAuthEndpoint(
    '/auth/logout',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
    'Unable to log out from FastDoc right now.',
  )
}
