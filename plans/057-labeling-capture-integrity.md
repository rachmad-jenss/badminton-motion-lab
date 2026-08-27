# Plan 057: Keep labeling previews bound to their capture

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/web/src/app/label/page.tsx apps/web/tests/labeling.spec.ts apps/agent/main.py apps/agent/test_security.py`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: plans/056-agent-credential-boundary.md
- **Category**: bug
- **Planned at**: commit `d6066d2`, 2026-08-27

## Why this matters

The labeling tool lets a maintainer edit the capture ID while retaining a previous video ticket. Export then combines the new ID with the old preview, which can create false domain truth. The API also issues a ticket for an unknown capture, producing a misleading success message before the video fails later. Both boundaries must reject stale or missing media before evidence can be saved.

## Current state

- `apps/web/src/app/label/page.tsx:58-74` requests a media ticket and leaves `ticketUrl` intact when the request fails.
- `apps/web/src/app/label/page.tsx:101-119` builds truth from the editable `captureId` and current video ref without checking which capture loaded the video.
- `apps/web/src/app/label/page.tsx:175-195` keeps the video mounted after the capture ID changes and has no media-error reset.
- `apps/agent/main.py:474-497` validates a ticket on streaming but `create_media_ticket` inserts a ticket without first checking the capture row.

The existing regression pattern is `apps/web/tests/labeling.spec.ts`; preserve the user-facing labels and court validation behavior.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `npm.cmd run typecheck` | exit 0 |
| Labeling contract | `npm.cmd run test:web -- --grep labeling` | labeling assertions pass when Chromium can launch |
| Agent tests | `npm.cmd run test:agent` | all tests pass |

## Scope

**In scope**:

- `apps/web/src/app/label/page.tsx`
- `apps/web/tests/labeling.spec.ts`
- `apps/agent/main.py`
- `apps/agent/test_security.py`

**Out of scope**:

- The domain manifest contents or any fabricated media/truth.
- Court-corner geometry rules already covered by `apps/web/src/lib/labeling.ts`.

## Git workflow

- Branch `jenss/improve-all-findings`.
- Atomic commit: `fix(label): bind truth export to loaded capture`.

## Steps

### Step 1: Write failing stale-preview and missing-capture tests

Add a browser test that loads capture A, changes the ID to B, and attempts export; it must see an accessible error and no download. Add a second browser assertion that a failed reload clears the old video. Add an agent test that `/media-tickets` with an unknown capture returns 404 and creates no ticket row.

**Verify**: focused tests fail against the current implementation because export succeeds with the stale preview and the endpoint returns 200 for an unknown capture.

### Step 2: Track the loaded capture and invalidate stale UI state

In `label/page.tsx`, store `loadedCaptureId` alongside `ticketUrl`. On capture-ID change or preview load start, clear the ticket, loaded ID, contact frame, and media-related validation state. On success require the response capture ID to match the requested ID. Add a video `onError` handler that clears the preview. Before download/copy, require a non-empty current ID, a matching `loadedCaptureId`, and a ticket; otherwise announce the required action through the existing status region.

**Verify**: rerun the focused labeling tests; the stale-preview test must pass without changing the valid export test.

### Step 3: Validate capture existence before issuing tickets

In `main.py`, query `captures` in `create_media_ticket`, return a 404 `HTTPException` when the row is absent, and ensure the resolved path remains available/allowed before creating the short-lived ticket. Keep the existing 401/410 behavior in `media_stream`. Add an assertion that failed requests leave the ticket table unchanged.

**Verify**: run the focused agent tests and `npm.cmd run test:agent`.

### Step 4: Commit only the labeling unit

Update `plans/README.md`, run `git diff --check`, and commit the scoped files.

**Verify**: `git show --stat --oneline HEAD` contains only the plan's files and `git diff --check` exits 0.

## Test plan

- Valid capture A still loads and exports `A.truth.json`.
- Changing to B or a failed reload prevents export and removes the old video.
- Unknown capture IDs return 404 and do not create orphan tickets.
- Existing court validation and copy/download paths remain green.

## Done criteria

- [ ] Export is impossible unless the loaded preview ID equals the current capture ID.
- [ ] Preview failures and media errors clear stale ticket state.
- [ ] Unknown captures never receive tickets.
- [ ] Focused labeling and agent tests pass.

## STOP conditions

- The endpoint needs a new public media authorization model.
- The existing label page no longer has one authoritative video ref.
- A test failure indicates a court-validation regression unrelated to this plan.

## Maintenance notes

Any future annotation fields must remain tied to `loadedCaptureId`; do not add a second independent capture identifier to the export path.
