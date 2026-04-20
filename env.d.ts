// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Shared Deepgram key; overridden in dev/prod when the specific vars below are set. */
  readonly VITE_DEEPGRAM_API_KEY?: string
  /** Optional: used only when `import.meta.env.DEV` is true (takes precedence over `VITE_DEEPGRAM_API_KEY`). */
  readonly VITE_DEEPGRAM_API_KEY_DEV?: string
  /** Optional: used only in production builds (takes precedence over `VITE_DEEPGRAM_API_KEY`). */
  readonly VITE_DEEPGRAM_API_KEY_PROD?: string
  /** Shared FastDoc API base URL, for both modes when mode-specific vars are absent (`/v1` appended automatically if omitted). */
  readonly VITE_FASTDOC_API_BASE_URL?: string
  /** Optional FastDoc API base URL used only when `import.meta.env.DEV` is true (`/v1` appended automatically if omitted). */
  readonly VITE_FASTDOC_API_BASE_URL_DEV?: string
  /** Optional FastDoc API base URL used only in production builds (`/v1` appended automatically if omitted). */
  readonly VITE_FASTDOC_API_BASE_URL_PROD?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
