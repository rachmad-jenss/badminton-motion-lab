# Plan 038: Add report export to the Analyze results view

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0046446..HEAD -- apps/web/src/app/analyze apps/web/src/app/contribute apps/web/tests`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: feature | docs-parity
- **Planned at**: commit `0046446`, 2026-08-17

## Why this matters

`apps/web/src/app/contribute/page.tsx:36` promises users: "Export the report
from the results view and share it (report only)." No export control exists in
the Analyze results view — a broken user-facing promise, and it is the exact
artifact the Plan 028 opt-in contribution loop (Q11/Q20: report JSON only,
video never leaves the PC) depends on. Exporting only the summary JSON keeps
dense pose/racket/shuttle series off disk and out of any sharing flow
(ADR-013), so this is the honest minimal feature.

## Current state

- `apps/web/src/app/analyze/page.tsx` — results render in several
  `<section className="panel">` blocks; `result` state holds
  `{ analysisRunId, agentMediaUrl, summary }`.
- The only download pattern in the app is the label page:
  `apps/web/src/app/label/page.tsx:88-108` (`Blob` + object URL + anchor click).
- Mocked analyze fixtures already exist in `apps/web/tests/ui.spec.ts`
  ("analysis success exposes findings, evidence, and withheld metrics").

## Scope

**In scope**:
- `apps/web/src/app/analyze/page.tsx` — one export control + handler
- `apps/web/tests/ui.spec.ts` — extend the success test with the export download

**Out of scope**: `contribute/page.tsx` copy (the promise becomes true by itself);
agent endpoints; any change to the summary payload shape.

## Steps

### Step 1: Add the export handler

In `analyze/page.tsx`, add a `downloadReport()` function near `loadInsight()`:

- Build the payload: `{ analysisRunId: result.analysisRunId, exportedAt: new Date().toISOString(), summary: result.summary }` — **do not include `agentMediaUrl`** (it embeds a media ticket).
- Use the label-page pattern: `new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" })`, object URL, anchor with `download = `bml-report-${result.analysisRunId}.json``, click, remove, revoke.
- Wire a button labeled **"Download report (JSON)"** (`className="d-btn d-btn-ghost"`) in the "Measurements" panel header row next to the `<h2>Measurements</h2>` (wrap h2 + button in a row div consistent with other headers).

### Step 2: Extend the browser test

In `apps/web/tests/ui.spec.ts`, inside the existing "analysis success" test
(after the evidence-frame assertion):

- `const downloadPromise = page.waitForEvent("download");`
- Click `Download report (JSON)`.
- Assert `download.suggestedFilename()` starts with `bml-report-` and ends `.json`.
- Read the stream, `JSON.parse`, assert `payload.analysisRunId === "run-1"`,
  `payload.summary.metrics[0].metricId === "elbow_angle_contact"`, and
  `payload.agentMediaUrl === undefined`.

**Verify**: `npm.cmd run test -w @bml/web` → exit 0.

### Step 3: Run the browser suite locally

Run the Playwright suite for `ui.spec.ts` from `apps/web` (repo convention:
`npm run test:web`; the config starts `serve-export.mjs` on 3101 against
`apps/web/out` — build first if missing).

**Verify**: all ui.spec.ts tests pass, including the new download assertions.

## Test plan

- New assertions inside the existing mocked-success test (step 2). No new file needed.
- The export is exercised with the mocked analyze response, so it runs in CI
  without a real agent.

## Done criteria

- [ ] Analyze results view shows "Download report (JSON)" when a result exists
- [ ] Downloaded JSON contains `analysisRunId`, `exportedAt`, `summary`, and no `agentMediaUrl`/ticket
- [ ] `ui.spec.ts` passes locally and in the full `npm run verify`
- [ ] `plans/README.md` status row updated

## STOP conditions

- If the button must live outside the Measurements panel for layout reasons,
  place it in the "What we found" panel header instead and note it — do not
  restructure the page.
- If the browser test cannot read the download stream with the existing
  pattern (labeling.spec.ts uses `download.createReadStream()`), mirror that
  exact pattern; if it still fails, stop and report.

## Maintenance notes

- If a future "anonymized report" flow is added (Plan 028 Phase 5), the export
  payload here is the natural input — keep `exportedAt` and no-media-ticket
  invariants.
- The exported file intentionally contains only the summary (no pose arrays),
  matching ADR-013.
