# Match Patient Page Scrape Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks `Tap to match a patient` in the recording page empty state, fetch the current active tab page content and print it to the extension console.

**Architecture:** Use a three-hop extension message flow: side panel UI sends a runtime message to background, background resolves the active tab and asks content script to extract page text, then returns payload to side panel for `console.log`. Keep extraction minimal and robust by returning URL, title, and cleaned `document.body.innerText`.

**Tech Stack:** WXT (MV3), TypeScript, React side panel, WebExtension APIs (`runtime`, `tabs`), content script.

---

## Spec

- Trigger source is the `Tap to match a patient and attach this visit.` button in `pages/recording-page.tsx`.
- Existing UX remains unchanged: clicking still opens the match patient sheet.
- On the same click, side panel asks extension runtime to scrape the active tab.
- Background validates active tab existence and URL scheme; unsupported pages return an error payload.
- Content script extracts plain text from the DOM and normalizes whitespace.
- Side panel prints the scrape result with `console.log`, and logs warning on errors.
- No backend upload in this task; local console output only.

## File Structure

- Modify: `wxt.config.ts`
  - Add permissions/host permissions needed for active tab scraping.
- Modify: `entrypoints/content.ts`
  - Add message handler and extraction helper.
- Modify: `entrypoints/background.ts`
  - Add runtime message handler that relays to active tab content script.
- Modify: `entrypoints/sidepanel/App.tsx`
  - Add handler that requests scrape + logs payload.
  - Pass this handler into recording-page match CTA chain.
- Modify: `pages/recording-page.tsx`
  - Add optional callback prop and invoke it in match CTA click.

### Task 1: Add scraping transport (content + background + permissions)

**Files:**
- Modify: `wxt.config.ts`
- Modify: `entrypoints/content.ts`
- Modify: `entrypoints/background.ts`
- Verify: `yarn compile`

- [ ] **Step 1: Update extension permissions for page access**

```ts
manifest: {
  permissions: ['sidePanel', 'microphone', 'tabs'],
  host_permissions: ['<all_urls>', 'https://api.deepgram.com/*'],
}
```

- [ ] **Step 2: Add content-script extractor + message responder**

```ts
type ExtractPageResponse =
  | { ok: true; data: { url: string; title: string; text: string } }
  | { ok: false; error: string }

function extractPageText(): ExtractPageResponse {
  const text = (document.body?.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 20_000)
  return {
    ok: true,
    data: {
      url: window.location.href,
      title: document.title,
      text,
    },
  }
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type !== 'FD_EXTRACT_ACTIVE_PAGE') return undefined
  return Promise.resolve(extractPageText())
})
```

- [ ] **Step 3: Add background relay for active-tab scrape**

```ts
browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== 'FD_SCRAPE_ACTIVE_TAB') return undefined
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id) return { ok: false, error: 'No active tab found' }
  const url = tab.url ?? ''
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'Unsupported tab URL' }
  return browser.tabs.sendMessage(tab.id, { type: 'FD_EXTRACT_ACTIVE_PAGE' })
})
```

- [ ] **Step 4: Verify compile passes**

Run: `yarn compile`  
Expected: TypeScript completes with no new errors.

### Task 2: Wire recording match button to scrape + log in side panel

**Files:**
- Modify: `pages/recording-page.tsx`
- Modify: `entrypoints/sidepanel/App.tsx`
- Verify: `yarn compile`

- [ ] **Step 1: Extend `RecordingPage` props with optional callback**

```ts
interface RecordingPageProps {
  onOpenMatchPatientPicker?: () => void
  onTapMatchPatient?: () => void
}
```

- [ ] **Step 2: Trigger callback from match CTA click**

```tsx
onClick={() => {
  onTapMatchPatient?.()
  onOpenMatchPatientPicker?.()
}}
```

- [ ] **Step 3: Implement side panel scrape requester and logger**

```ts
async function handleTapMatchPatient() {
  const result = await browser.runtime.sendMessage({ type: 'FD_SCRAPE_ACTIVE_TAB' })
  if (result?.ok) {
    console.log('[FastDoc] Active tab content:', result.data)
  } else {
    console.warn('[FastDoc] Active tab scrape failed:', result?.error ?? 'Unknown error')
  }
}
```

- [ ] **Step 4: Pass callback to `RecordingPage`**

```tsx
<RecordingPage
  ...
  onTapMatchPatient={handleTapMatchPatient}
/>
```

- [ ] **Step 5: Verify compile passes**

Run: `yarn compile`  
Expected: TypeScript completes with no new errors.

### Task 3: Manual verification flow

**Files:**
- Verify runtime behavior in Chrome side panel

- [ ] **Step 1: Build and run extension dev mode**

Run: `yarn dev`  
Expected: Extension loads with side panel enabled.

- [ ] **Step 2: Open a regular `https://` page and open side panel**

Expected: Recording page shows empty-state CTA if no patient attached.

- [ ] **Step 3: Click `Tap to match a patient and attach this visit.`**

Expected:
- Patient match sheet opens as before.
- Side panel console logs `[FastDoc] Active tab content: { url, title, text }`.

- [ ] **Step 4: Negative validation on unsupported pages**

Use `chrome://settings` tab and click CTA again.  
Expected: warning log with `Unsupported tab URL`.

