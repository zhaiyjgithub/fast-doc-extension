/**
 * Vite / WXT environment helpers.
 *
 * Mode-specific files (loaded automatically by Vite):
 * - `yarn dev` → `.env`, `.env.local`, `.env.development`, `.env.development.local`
 * - `yarn build` → `.env`, `.env.local`, `.env.production`, `.env.production.local`
 *
 * Deepgram key resolution prefers explicit per-environment vars, then falls back
 * to the shared `VITE_DEEPGRAM_API_KEY` (typical when using only mode-specific files).
 */

/** Vite mode, e.g. `development` | `production` (or custom `--mode`). */
export const viteMode = import.meta.env.MODE

export const isDevelopment = import.meta.env.DEV

export const isProduction = import.meta.env.PROD

const FASTDOC_API_BASE_URL_FALLBACK = 'http://127.0.0.1:8000/v1'

/**
 * Deepgram API key for the current build mode.
 *
 * - **development:** `VITE_DEEPGRAM_API_KEY_DEV` → `VITE_DEEPGRAM_API_KEY`
 * - **production:** `VITE_DEEPGRAM_API_KEY_PROD` → `VITE_DEEPGRAM_API_KEY`
 */
export function deepgramApiKey(): string {
  if (import.meta.env.DEV) {
    const k =
      import.meta.env.VITE_DEEPGRAM_API_KEY_DEV ?? import.meta.env.VITE_DEEPGRAM_API_KEY
    return k ? String(k) : ''
  }
  const k =
    import.meta.env.VITE_DEEPGRAM_API_KEY_PROD ?? import.meta.env.VITE_DEEPGRAM_API_KEY
  return k ? String(k) : ''
}

function normalizeBaseUrl(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  const trimmed = value.trim()
  return trimmed ? trimmed.replace(/\/+$/, '') : ''
}

function ensureV1Suffix(baseUrl: string): string {
  if (!baseUrl) {
    return ''
  }
  return /\/v1$/i.test(baseUrl) ? baseUrl : `${baseUrl}/v1`
}

/**
 * FastDoc API base URL for the current build mode.
 *
 * - **development:** `VITE_FASTDOC_API_BASE_URL_DEV` → `VITE_FASTDOC_API_BASE_URL`
 * - **production:** `VITE_FASTDOC_API_BASE_URL_PROD` → `VITE_FASTDOC_API_BASE_URL`
 * - **fallback:** `http://127.0.0.1:8000/v1`
 */
export function fastdocApiBaseUrl(): string {
  if (import.meta.env.DEV) {
    return (
      ensureV1Suffix(normalizeBaseUrl(import.meta.env.VITE_FASTDOC_API_BASE_URL_DEV)) ||
      ensureV1Suffix(normalizeBaseUrl(import.meta.env.VITE_FASTDOC_API_BASE_URL)) ||
      FASTDOC_API_BASE_URL_FALLBACK
    )
  }

  return (
    ensureV1Suffix(normalizeBaseUrl(import.meta.env.VITE_FASTDOC_API_BASE_URL_PROD)) ||
    ensureV1Suffix(normalizeBaseUrl(import.meta.env.VITE_FASTDOC_API_BASE_URL)) ||
    FASTDOC_API_BASE_URL_FALLBACK
  )
}
