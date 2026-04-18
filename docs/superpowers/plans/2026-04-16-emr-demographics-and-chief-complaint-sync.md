# EMR Demographics + Chief Complaint Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract patient demographics from the active EMR page and sync generated SOAP/ICD/CPT content into the EMR Chief Complaint section from the extension.

**Architecture:** Extend the current `sidepanel -> background -> content script` message bridge with two new operations: demographics extraction and Chief Complaint write-back. Keep DOM knowledge in `content.ts` (EMR adapter layer), keep tab targeting in `background.ts`, and trigger flows from side panel (`App.tsx` + `SoapPage` export action).

**Tech Stack:** WXT (MV3), TypeScript, React side panel, WebExtension runtime/tabs messaging, DOM extraction/manipulation.

---

## Spec

- `Tap to match a patient` in recording page should try to extract EMR demographics and reflect matched patient info in extension state.
- Extraction source is EMR DOM under `#PatientDemographics` (fallback raw text parsing from this section).
- Extracted demographics should populate at least: `name`, `dob`, `gender`, `patientId`.
- SOAP page export action should sync SOAP + ICD + CPT into EMR Chief Complaint section.
- Chief Complaint sync target:
  - `#div_chiefComplaint_view` for chief complaint / reason text
  - `#div_presentIllness_view` for HPI style narrative
- If required DOM nodes are missing, return structured errors and show warning toast in extension.
- Existing behavior (side panel navigation, recording flow) must remain intact.

## File Structure

- Modify: `entrypoints/content.ts`
  - Add EMR-specific extract/write operations and message handler branches.
- Modify: `entrypoints/background.ts`
  - Add message relay branches for demographics extract + chief complaint sync.
- Modify: `entrypoints/sidepanel/App.tsx`
  - Replace tap-to-match logging path with demographics extraction and matched patient state update.
  - Add SOAP sync handler and pass callback into SOAP page.
- Modify: `pages/soap-page.tsx`
  - Add prop callback for EMR sync from export action.
  - Build payload from SOAP section bodies + ICD/CPT suggestions.

### Task 1: Add EMR DOM adapter operations in content/background bridge

**Files:**
- Modify: `entrypoints/content.ts`
- Modify: `entrypoints/background.ts`
- Verify: `yarn compile`

- [ ] **Step 1: Add demographics extraction response types and parser in content script**

```ts
type ExtractDemographicsData = {
  name: string | null
  dob: string | null
  gender: 'Male' | 'Female' | 'Other' | null
  patientId: string | null
  rawText: string
}

type ExtractDemographicsResponse =
  | { ok: true; data: ExtractDemographicsData }
  | { ok: false; error: string }
```

- [ ] **Step 2: Implement parser using `#PatientDemographics` text**

```ts
const demographicsRoot = document.getElementById('PatientDemographics')
const raw = (demographicsRoot?.innerText ?? '').replace(/\s+/g, ' ').trim()
if (!raw) return { ok: false, error: 'Patient demographics section not found' }
// regex extract Name/DOB/Gender/Patient ID + normalize DOB to yyyy-mm-dd
```

- [ ] **Step 3: Add Chief Complaint sync operation in content script**

```ts
type SyncChiefComplaintPayload = {
  chiefComplaintText: string
  presentIllnessText: string
}

const chiefEl = document.getElementById('div_chiefComplaint_view')
const hpiEl = document.getElementById('div_presentIllness_view')
// set DOM text/HTML and dispatch input/change events
```

- [ ] **Step 4: Add background relays for both new message types**

```ts
FD_EXTRACT_EMR_DEMOGRAPHICS
FD_SYNC_EMR_CHIEF_COMPLAINT
```

Run active-tab query + URL validation + `tabs.sendMessage` in same pattern as existing scrape path.

- [ ] **Step 5: Verify compile**

Run: `yarn compile`  
Expected: `tsc --noEmit` passes with no new errors.

### Task 2: Wire sidepanel actions for demographics match + SOAP sync

**Files:**
- Modify: `entrypoints/sidepanel/App.tsx`
- Modify: `pages/soap-page.tsx`
- Verify: `yarn compile`

- [ ] **Step 1: Replace recording-page tap-match handler with demographics flow**

```ts
const result = await browser.runtime.sendMessage({ type: 'FD_EXTRACT_EMR_DEMOGRAPHICS' })
if (result?.ok) {
  setMatchedPatient({
    id: result.data.patientId ?? `emr-${Date.now()}`,
    name: result.data.name ?? 'Unknown Patient',
    dob: result.data.dob ?? '1970-01-01',
    gender: result.data.gender ?? undefined,
    idNumber: result.data.patientId ?? undefined,
  })
}
```

- [ ] **Step 2: Add SOAP->EMR sync callback in `App.tsx`**

```ts
const result = await browser.runtime.sendMessage({
  type: 'FD_SYNC_EMR_CHIEF_COMPLAINT',
  payload,
})
// toast success / warning based on result.ok
```

- [ ] **Step 3: Extend `SoapPage` props with sync callback**

```ts
onSyncToEmr?: (payload: {
  chiefComplaintText: string
  presentIllnessText: string
}) => Promise<void> | void
```

- [ ] **Step 4: Build export payload from SOAP + ICD/CPT in `SoapPage` and call callback**

```ts
const chiefComplaintText = bodies.subjective
const presentIllnessText = [
  `Objective:\n${bodies.objective}`,
  `Assessment:\n${bodies.assessment}`,
  `Plan:\n${bodies.plan}`,
  `ICD: ${ICD_FINDINGS.map((x) => x.icdCode).join(', ')}`,
  `CPT: ${CPT_FINDINGS.map((x) => x.cptCode).join(', ')}`,
].join('\n\n')
```

- [ ] **Step 5: Verify compile**

Run: `yarn compile`  
Expected: `tsc --noEmit` passes.

### Task 3: Manual runtime verification for EMR page

**Files:**
- Verify runtime behavior in loaded Chrome extension

- [ ] **Step 1: Run extension dev build**

Run: `yarn dev`  
Expected: extension reloads successfully.

- [ ] **Step 2: Demographics extraction validation**

On EMR page containing `#PatientDemographics`, click `Tap to match a patient`.  
Expected:
- matched patient appears in recording page
- success toast appears

- [ ] **Step 3: Chief Complaint sync validation**

Open SOAP page and trigger export action.  
Expected:
- `#div_chiefComplaint_view` receives chief complaint text
- `#div_presentIllness_view` receives SOAP + ICD/CPT text block
- success toast appears

- [ ] **Step 4: Failure path check**

Trigger on a non-EMR page.  
Expected:
- warning toast with clear missing-section error
- no extension crash

