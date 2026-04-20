# Extension Auth Session Persistence Design

## Context

The extension currently simulates login in UI state only:

- `components/auth/login-form.tsx` has a demo-only email 2FA step.
- `entrypoints/sidepanel/App.tsx` marks user as logged in via `setTimeout`.
- No backend auth API calls are made.
- No persistent auth/session storage exists, so reload loses login.

Backend now provides real provider auth endpoints (`/v1/auth/*`) with wrapped responses:

- `POST /v1/auth/login` (form): returns `{ data: { access_token, refresh_token, ... } }`
- `POST /v1/auth/refresh` (json): returns same token shape under `data`
- `GET /v1/auth/me` (bearer): returns current user under `data`
- `POST /v1/auth/logout` (bearer): returns `{ data: { message } }`

## Scope

In scope:

1. Frontend integrates real login/logout against backend provider auth APIs.
2. Extension persists auth session and restores it on restart (continuous login).
3. Expired access token is recovered via refresh on startup.
4. Temporarily skip email 2FA UX (single-step email+password login only).

Out of scope:

- Real backend email 2FA or OTP challenge flow.
- Admin login flow in extension.
- Token rotation policy redesign on backend.

## Product/UX Decisions

1. **Single-step login now**
   - Login form submits email+password directly.
   - Demo OTP step is disabled for now.

2. **Session restore behavior**
   - On sidepanel app mount:
     - Read stored session from extension storage.
     - If no session, stay logged-out.
     - If session exists, call `GET /v1/auth/me` with stored access token.
       - If success: restore logged-in UI.
       - If 401: call `/v1/auth/refresh`; if success, save new tokens and retry `/me`; else clear session and show login.

3. **Logout behavior**
   - Call `/v1/auth/logout` best-effort using current access token.
   - Always clear local session and reset UI state.

## Technical Design

### 1) Add typed API + auth session utilities

Create focused library modules:

- `lib/auth-api.ts`
  - backend request helpers for `/v1/auth/login`, `/refresh`, `/me`, `/logout`
  - typed parsing of `{ data: ... }`

- `lib/auth-session.ts`
  - storage accessors for session persistence in `browser.storage.local`
  - `loadSession`, `saveSession`, `clearSession`

- `lib/auth-types.ts`
  - shared types for token payload and persisted session

### 2) Configure backend base URL

Add env support:

- `VITE_FASTDOC_API_BASE_URL` (+ optional dev/prod overrides)
- default fallback: `http://127.0.0.1:8000/v1`

Add helper in `lib/env.ts` and types in `env.d.ts`.

### 3) Integrate into sidepanel app

Update `entrypoints/sidepanel/App.tsx`:

- Replace fake `setTimeout` login with real API call.
- Track auth bootstrap state:
  - `isAuthBootstrapping` to avoid flicker while restoring session.
- On successful login:
  - call `/auth/login`, then `/auth/me`, then persist session.
- On mount:
  - run restore flow described above.
- On logout:
  - call `/auth/logout` best-effort, clear session + local UI state.

### 4) Skip demo email 2FA step

Update `components/auth/login-form.tsx`:

- Keep current visual style but bypass demo OTP step.
- Credentials submit directly invokes `onLogin`.
- Remove demo-only OTP toasts/errors for now.

## Error Handling

- Invalid credentials -> show toast from backend 401 detail when available.
- Network/API errors -> show user-friendly toast and keep on login page.
- Session restore failures -> silent clear + remain logged-out.
- Logout API failure -> still clear local session (do not trap user).

## Security Notes (current phase)

- Store tokens in extension local storage for persistent login.
- Do not log tokens in debug logs.
- Use bearer header only for auth endpoints.
- 2FA remains disabled until backend supports challenge/verify flow.

## Verification Plan

1. Compile:
   - `npm run compile`
2. Manual:
   - Start with clean storage -> login with valid provider account -> app stays logged in.
   - Reload sidepanel/browser -> session restores without re-login.
   - Tamper/expire token -> refresh path restores or logs out cleanly.
   - Logout -> returns to login and remains logged out after reload.

