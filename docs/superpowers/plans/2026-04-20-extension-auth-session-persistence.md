# Extension Auth Session Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate real provider login/logout APIs in extension sidepanel and persist session for continuous login, while explicitly skipping email 2FA for now.

**Architecture:** Add a small auth data layer (`auth-types`, `auth-session`, `auth-api`) to isolate backend protocol and storage details from UI. Sidepanel `App.tsx` becomes the auth orchestrator (bootstrap, login, logout, refresh-on-expiry). `LoginForm` remains presentation-first and drops demo OTP gating.

**Tech Stack:** WXT + React + TypeScript, WebExtension `browser.storage.local`, Fetch API, FastDoc `/v1/auth/*` endpoints.

---

## File Structure

- Create: `lib/auth-types.ts` (shared auth/session types)
- Create: `lib/auth-session.ts` (session storage helpers)
- Create: `lib/auth-api.ts` (typed API client for `/v1/auth/*`)
- Modify: `lib/env.ts` (FastDoc API base URL resolver)
- Modify: `env.d.ts` (new env vars)
- Modify: `components/auth/login-form.tsx` (skip demo email 2FA)
- Modify: `entrypoints/sidepanel/App.tsx` (real auth integration + session restore)
- Test/verify: `yarn compile`

### Task 1: Build auth data layer (types, storage, API)

**Files:**
- Create: `lib/auth-types.ts`
- Create: `lib/auth-session.ts`
- Create: `lib/auth-api.ts`
- Modify: `lib/env.ts`
- Modify: `env.d.ts`
- Test: `yarn compile`

- [ ] **Step 1: Add shared auth types**

```ts
export type AuthTokens = {
  accessToken: string
  refreshToken: string
}

export type AuthUser = {
  userId: string
  email: string
  userType: 'doctor' | 'admin'
  providerId: string | null
}

export type PersistedAuthSession = AuthTokens & {
  username: string
  user: AuthUser
}
```

- [ ] **Step 2: Add session storage helpers (`browser.storage.local`)**

```ts
const AUTH_SESSION_KEY = 'fastdoc.auth.session'

export async function loadAuthSession(): Promise<PersistedAuthSession | null> { ... }
export async function saveAuthSession(session: PersistedAuthSession): Promise<void> { ... }
export async function clearAuthSession(): Promise<void> { ... }
```

- [ ] **Step 3: Add typed auth API helpers**

```ts
export async function loginWithPassword(email: string, password: string): Promise<LoginResult> { ... }
export async function refreshProviderToken(refreshToken: string): Promise<LoginResult> { ... }
export async function fetchCurrentUser(accessToken: string): Promise<AuthUser> { ... }
export async function logoutProvider(accessToken: string): Promise<void> { ... }
```

Use backend shape from `@api-integration-guide.md`:

```json
{ "data": { ... } }
```

- [ ] **Step 4: Add FastDoc API base URL env resolver**

```ts
// dev: VITE_FASTDOC_API_BASE_URL_DEV -> VITE_FASTDOC_API_BASE_URL
// prod: VITE_FASTDOC_API_BASE_URL_PROD -> VITE_FASTDOC_API_BASE_URL
// fallback: http://127.0.0.1:8000/v1
export function fastdocApiBaseUrl(): string { ... }
```

- [ ] **Step 5: Verify compile**

Run: `yarn compile`  
Expected: no new TypeScript errors.

### Task 2: Integrate login/logout + session restore in sidepanel

**Files:**
- Modify: `components/auth/login-form.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`
- Test: `yarn compile`

- [ ] **Step 1: Simplify LoginForm to credentials-only flow**

Replace demo OTP flow with direct submit:

```ts
function handleCredentialsSubmit(e: React.FormEvent) {
  e.preventDefault()
  onLogin(username, password)
}
```

Remove demo OTP step state and buttons; keep email/password UI and loading behavior.

- [ ] **Step 2: Add auth bootstrap state in App**

```ts
const [isAuthBootstrapping, setIsAuthBootstrapping] = React.useState(true)
```

Startup flow:
- load stored session
- call `/auth/me` with access token
- on 401, try `/auth/refresh`, persist new tokens, retry `/me`
- on failure clear session + show logged-out

- [ ] **Step 3: Replace fake login with real API login**

```ts
const login = await loginWithPassword(username, password)
const me = await fetchCurrentUser(login.accessToken)
await saveAuthSession(...)
setIsLoggedIn(true)
```

Show toast on success/failure; keep existing user-facing copy style.

- [ ] **Step 4: Wire logout API + local clear**

```ts
await logoutProvider(accessToken).catch(() => undefined)
await clearAuthSession()
resetUiState()
```

Always clear local state even if network logout fails.

- [ ] **Step 5: Gate initial rendering during bootstrap**

If `isAuthBootstrapping`, render lightweight loading state (or reuse existing shell) to avoid login flicker before session restore completes.

- [ ] **Step 6: Verify compile**

Run: `yarn compile`  
Expected: no new TypeScript errors.

### Task 3: Verification + review cleanup

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx` (only if review findings)
- Modify: `components/auth/login-form.tsx` (only if review findings)
- Test: `yarn compile`

- [ ] **Step 1: Manual behavior verification checklist**

1. Fresh load (no stored session) shows login screen.
2. Valid login enters app and displays username.
3. Reload sidepanel restores logged-in state.
4. Logout returns to login and does not auto-login on reload.

- [ ] **Step 2: Run static verification**

Run: `yarn compile`  
Expected: pass.

- [ ] **Step 3: Apply code-review fixes**

Address issues from:
- spec compliance review
- code-quality review

Then rerun `yarn compile`.

