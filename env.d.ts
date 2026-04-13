// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shared Deepgram key; overridden in dev/prod when the specific vars below are set. */
  readonly VITE_DEEPGRAM_API_KEY?: string
  /** Optional: used only when `import.meta.env.DEV` is true (takes precedence over `VITE_DEEPGRAM_API_KEY`). */
  readonly VITE_DEEPGRAM_API_KEY_DEV?: string
  /** Optional: used only in production builds (takes precedence over `VITE_DEEPGRAM_API_KEY`). */
  readonly VITE_DEEPGRAM_API_KEY_PROD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
