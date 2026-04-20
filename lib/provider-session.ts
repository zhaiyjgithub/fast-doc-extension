import type { ProviderProfile } from './mock-provider'

const PROVIDER_PROFILE_KEY = 'fastdoc.provider.profile'
let warnedMissingStorage = false

type PersistedProviderProfile = {
  providerId: string
  profile: ProviderProfile
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

function isProviderProfile(value: unknown): value is ProviderProfile {
  if (!isPlainObject(value)) {
    return false
  }
  return (
    !!asNonEmptyString(value.firstName) &&
    !!asNonEmptyString(value.lastName) &&
    !!asNonEmptyString(value.specialty) &&
    !!asNonEmptyString(value.email) &&
    !!asNonEmptyString(value.clinicName) &&
    !!asNonEmptyString(value.siteLabel)
  )
}

function isPersistedProviderProfile(value: unknown): value is PersistedProviderProfile {
  if (!isPlainObject(value)) {
    return false
  }
  return !!asNonEmptyString(value.providerId) && isProviderProfile(value.profile)
}

type StorageLocalLike = {
  get: (key: string) => Promise<Record<string, unknown>>
  set: (items: Record<string, unknown>) => Promise<void>
  remove: (key: string) => Promise<void>
}

function storageLocalOrNull(): StorageLocalLike | null {
  const g = globalThis as {
    browser?: {
      storage?: {
        local?: {
          get: (key: string) => Promise<Record<string, unknown>>
          set: (items: Record<string, unknown>) => Promise<void>
          remove: (key: string) => Promise<void>
        }
      }
    }
    chrome?: {
      storage?: {
        local?: {
          get: (key: string, cb: (items: unknown) => void) => void
          set: (items: Record<string, unknown>, cb?: () => void) => void
          remove: (key: string, cb?: () => void) => void
        }
      }
      runtime?: { lastError?: { message?: string } }
    }
  }

  const browserLocal = g.browser?.storage?.local
  if (browserLocal) {
    return {
      get: (key: string) => browserLocal.get(key),
      set: (items: Record<string, unknown>) => browserLocal.set(items),
      remove: (key: string) => browserLocal.remove(key),
    }
  }

  const chromeLocal = g.chrome?.storage?.local
  if (chromeLocal) {
    return {
      get: (key: string) =>
        new Promise((resolve, reject) => {
          chromeLocal.get(key, (items) => {
            const maybeError = g.chrome?.runtime?.lastError
            if (maybeError) {
              reject(new Error(maybeError.message || 'chrome.storage.local.get failed'))
              return
            }
            resolve((items || {}) as Record<string, unknown>)
          })
        }),
      set: (items: Record<string, unknown>) =>
        new Promise((resolve, reject) => {
          chromeLocal.set(items, () => {
            const maybeError = g.chrome?.runtime?.lastError
            if (maybeError) {
              reject(new Error(maybeError.message || 'chrome.storage.local.set failed'))
              return
            }
            resolve()
          })
        }),
      remove: (key: string) =>
        new Promise((resolve, reject) => {
          chromeLocal.remove(key, () => {
            const maybeError = g.chrome?.runtime?.lastError
            if (maybeError) {
              reject(new Error(maybeError.message || 'chrome.storage.local.remove failed'))
              return
            }
            resolve()
          })
        }),
    }
  }

  if (!warnedMissingStorage) {
    warnedMissingStorage = true
    console.warn(
      '[FastDoc][provider] no extension storage API available (browser/chrome); provider profile will not persist.',
    )
  }
  return null
}

export async function loadPersistedProviderProfile(providerId: string): Promise<ProviderProfile | null> {
  const pid = providerId.trim()
  if (!pid) {
    return null
  }
  const storageLocal = storageLocalOrNull()
  if (!storageLocal) {
    return null
  }
  const raw = (await storageLocal.get(PROVIDER_PROFILE_KEY)) as Record<string, unknown>
  const maybeValue = raw[PROVIDER_PROFILE_KEY]
  if (!isPersistedProviderProfile(maybeValue)) {
    if (Object.prototype.hasOwnProperty.call(raw, PROVIDER_PROFILE_KEY)) {
      await storageLocal.remove(PROVIDER_PROFILE_KEY)
    }
    return null
  }
  if (maybeValue.providerId !== pid) {
    return null
  }
  return maybeValue.profile
}

export async function savePersistedProviderProfile(
  providerId: string,
  profile: ProviderProfile,
): Promise<void> {
  const pid = providerId.trim()
  if (!pid || !isProviderProfile(profile)) {
    return
  }
  const storageLocal = storageLocalOrNull()
  if (!storageLocal) {
    return
  }
  await storageLocal.set({
    [PROVIDER_PROFILE_KEY]: {
      providerId: pid,
      profile,
    } satisfies PersistedProviderProfile,
  })
}

export async function clearPersistedProviderProfile(): Promise<void> {
  const storageLocal = storageLocalOrNull()
  if (!storageLocal) {
    return
  }
  await storageLocal.remove(PROVIDER_PROFILE_KEY)
}
