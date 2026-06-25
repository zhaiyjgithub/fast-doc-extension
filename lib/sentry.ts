/**
 * Sentry initialization helpers for the extension.
 *
 * Two contexts are supported:
 * - `sidepanel`: full browser SDK, default integrations, React `ErrorBoundary`
 *   pairs with `Sentry.ErrorBoundary` in `entrypoints/sidepanel/main.tsx`.
 * - `background`: Manifest V3 service worker — DOM-dependent integrations
 *   (BrowserApiErrors, Breadcrumbs, Replay, …) are disabled.
 *
 * Content scripts intentionally do NOT initialize Sentry: they execute in the
 * host page context (e.g. MDLand eClinic) and would surface unrelated errors.
 *
 * DSN resolution mirrors `lib/env.ts`:
 *   - dev:  VITE_SENTRY_DSN_DEV  ?? VITE_SENTRY_DSN
 *   - prod: VITE_SENTRY_DSN_PROD ?? VITE_SENTRY_DSN
 * Empty string disables Sentry entirely (safe no-op).
 */
import * as Sentry from '@sentry/react'
import { isProduction } from './env'

export { Sentry }

export type SentryContext = 'sidepanel' | 'background'

export function sentryDsn(): string {
  const k = isProduction
    ? import.meta.env.VITE_SENTRY_DSN_PROD ?? import.meta.env.VITE_SENTRY_DSN
    : import.meta.env.VITE_SENTRY_DSN_DEV ?? import.meta.env.VITE_SENTRY_DSN
  return k ? String(k) : ''
}

let initialized = false
let initializedContext: SentryContext | null = null

export function initSentry(context: SentryContext): void {
  if (initialized) return

  const dsn = sentryDsn()
  if (!dsn) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[sentry] DSN not configured for ${context}; skipping init.`)
    }
    return
  }

  let release: string | undefined
  try {
    release = `fast-doc-extension@${browser.runtime.getManifest().version}`
  } catch {
    // browser global may be unavailable during HMR boundaries; tolerate.
  }

  const isWorker = context === 'background'

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    defaultIntegrations: isWorker ? false : undefined,
    integrations: isWorker
      ? [
          Sentry.dedupeIntegration(),
          Sentry.functionToStringIntegration(),
          Sentry.inboundFiltersIntegration(),
          Sentry.linkedErrorsIntegration(),
        ]
      : undefined,
  })

  Sentry.setTag('entrypoint', context)
  Sentry.setTag('browser_extension', 'true')

  initialized = true
  initializedContext = context
}

export function getSentryContext(): SentryContext | null {
  return initializedContext
}
