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
