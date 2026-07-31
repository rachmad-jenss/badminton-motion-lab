# Plan 023: Let beginners choose a local video without typing a Windows path

> **Executor instructions**: Keep original video local. The browser may send
> the selected file only to the paired Local Agent on localhost; never add a
> cloud upload path. Run the drift check first and stop if the current request
> or capture schema differs from this plan.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: none
- **Category**: dx | direction | security
- **Planned at**: commit `679a5c1`, 2026-07-31

## Why this matters

The primary analysis form currently asks for an absolute Windows path. That
requires users to understand Explorer paths and the agent media allowlist
before they can start. The product requirements describe a simpler flow where
an athlete records a video, opens the app, and chooses the video.

## Current state

- `apps/web/src/app/analyze/page.tsx:222` renders the only capture input as
  `Absolute local video path`.
- `apps/agent/main.py:106` accepts only `path: str` for registration.
- `apps/agent/main.py:287` registers an existing allowlisted path and records
  it as `owned=0`.
- `apps/agent/storage/db.py:112` already distinguishes agent-owned copies so
  retention can safely delete imported media later.
- `apps/agent/requirements.txt` already includes `python-multipart`.
- `apps/web/tests/ui.spec.ts:254` fills a Windows path directly in the happy
  path test.
- ADR-013 requires original video to stay on the user machine. A localhost
  browser-to-agent copy satisfies that boundary; no Supabase or remote upload
  may be introduced.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Web typecheck | `npm.cmd run lint` | exit 0 |
| Agent tests | `npm.cmd run test:agent` | pytest and smoke pass |
| Browser tests | `npm.cmd run test:web` | all Playwright tests pass |
| Full gate | `npm.cmd run verify` | exit 0 |

## Scope

**In scope**:

- `apps/agent/main.py`
- `apps/agent/adapters/paths.py`
- `apps/agent/test_security.py` or `apps/agent/test_integrity.py`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/src/lib/agent.ts`
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- Cloud storage or Supabase upload.
- Removing the existing path registration API; retain it as an advanced
  fallback for developers.
- Rewriting the CV pipeline or readiness gates.

## Steps

### Step 1: Add authenticated local import

Add `POST /captures/import` using `UploadFile`. Stream the request into a
randomly named temporary file beneath `DATA_DIR/captures`, enforce a bounded
byte limit, accept only the existing video extensions, probe the media, hash
the final bytes, then atomically rename and insert a capture with `owned=1`.
Delete the temporary/final copy whenever validation fails. Return the same
`captureId`, `fingerprint`, and `metadata` shape needed by `/analyze`.

**Verify**: TestClient imports an allowed video, records `owned=1`, rejects an
unsupported extension and an oversized request, and leaves no partial file.

### Step 2: Add a beginner-friendly file chooser

Render a labeled `input type="file" accept="video/*"` as the primary Analyze
input. Keep the absolute path in a collapsed `Advanced` section. Show the
selected filename and a short local-only privacy explanation. Submit the file
through the new agent helper, then reuse the existing `/analyze` request.

**Verify**: the browser test selects a fixture through the file input, asserts
`/captures/import` receives multipart data, and asserts `/analyze` receives the
returned capture ID; no path typing is needed.

### Step 3: Preserve retry and advanced fallback

Keep selected file, stroke, hand, and footwork choices after import or analysis
failure. If no file is selected, allow the advanced path fallback. Do not show
the path field as the default or require it for the primary flow.

**Verify**: a failed import can be retried without reselecting the file, and
the existing path-based flow still works in an explicit advanced test.

## Done criteria

- [ ] A beginner can choose a local video with a file picker.
- [ ] The file is sent only to the paired localhost agent.
- [ ] Size, extension, probe, hash, and cleanup checks are covered by tests.
- [ ] Existing path registration remains available as an advanced fallback.
- [ ] `npm.cmd run verify` and browser tests pass.

## STOP conditions

- The selected browser file cannot be sent to the paired local agent without a
  cloud or remote upload; stop and report instead of weakening ADR-013.
- The existing capture schema cannot represent owned imported media without a
  migration; stop before changing the database schema.
- A test requires committing personal media or credentials.

## Maintenance notes

Imported copies are local agent data and must remain covered by retention. Any
future upload feature must preserve the distinction between local import and
cloud persistence, and must add explicit size/content limits.
