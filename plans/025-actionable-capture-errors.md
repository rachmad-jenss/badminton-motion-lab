# Plan 025: Show actionable capture and quality-gate errors

> **Executor instructions**: Keep server errors safe and structured. Never
> display secrets, bearer tokens, or raw provider responses. Preserve the
> existing honest quality-gate behavior; improve only its explanation.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/023-local-video-picker.md
- **Category**: correctness | dx
- **Planned at**: commit `679a5c1`, 2026-07-31

## Why this matters

The agent already knows whether a file is missing, unsupported, outside the
allowlist, unreadable, or rejected by a particular quality check. The web
client currently collapses most 4xx responses into a generic failure, so a
beginner cannot know what to change.

## Current state

- `apps/web/src/lib/agent.ts:113` maps only a few statuses to custom copy and
  returns the fallback for most `AgentRequestError` values.
- `apps/web/src/app/analyze/page.tsx:136` renders one generic analysis error.
- `apps/agent/main.py:297` converts `MediaError` to HTTP 400 with free text.
- `apps/agent/main.py:447` serializes quality details into a 422 message.
- `apps/agent/adapters/quality.py` already returns check IDs, measured values,
  thresholds, and messages.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Web typecheck | `npm.cmd run lint` | exit 0 |
| Agent tests | `npm.cmd run test:agent` | all pass |
| Browser tests | `npm.cmd run test:web` | all pass |
| Full gate | `npm.cmd run verify` | exit 0 |

## Scope

**In scope**:

- `apps/agent/main.py`
- `apps/agent/adapters/quality.py` only if a stable user-facing mapping is
  required
- `apps/agent/test_integrity.py` or `apps/agent/test_security.py`
- `apps/web/src/lib/agent.ts`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- Relaxing quality thresholds.
- Exposing raw filesystem allowlist internals unnecessarily.
- Changing metric truth or CV behavior.

## Steps

### Step 1: Define a safe error contract

Return structured error details for known capture failures and quality
rejection: stable `code`, plain `message`, optional `action`, and quality
checks when applicable. Keep unknown failures generic and log-free in the
browser. Update `AgentRequestError` parsing so object and nested JSON details
remain available without rendering raw payloads.

**Verify**: focused agent tests assert codes for missing file, unsupported
media, and quality rejection; no secret or full raw provider text is returned.

### Step 2: Render recovery actions

Add a reusable web error presentation that shows the short explanation, the
next action, and failed quality checks with measured-vs-required values when
available. Link capture failures to the relevant guide and allow retry while
preserving the selected input.

**Verify**: Playwright covers missing file, unsupported file, quality failure,
expired media, and network failure; each has an appropriate CTA and no raw
JSON dump.

### Step 3: Keep status semantics distinct

Do not label every 422 as a quality failure. Keep registration errors,
analysis errors, media playback expiry, offline agent, and quality rejection
visibly distinct.

**Verify**: existing pairing and quality tests still pass, plus a regression
assertion proves a generic 422 does not claim the capture failed quality.

## Done criteria

- [ ] Known capture failures have stable codes and recovery copy.
- [ ] Quality failures show failed checks and measured requirements.
- [ ] Generic failures remain safe and do not expose raw response bodies.
- [ ] Retry preserves user input.
- [ ] Full local and browser gates pass.

## STOP conditions

- The backend cannot distinguish an error without changing CV behavior; add a
  contract-only code and report the ambiguity.
- A proposed message would expose credentials, tokens, or sensitive paths.

## Maintenance notes

New agent error codes must be added to both the backend contract tests and the
web presentation map. Keep quality check IDs stable for support and tests.
