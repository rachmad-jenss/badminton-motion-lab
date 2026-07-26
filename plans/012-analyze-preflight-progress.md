# Plan 012: Make Analyze guided, cancellable-looking, and athlete-correct

> **Executor instructions**: Follow this plan after Plan 010. Plan 009 Slice 5
> owns the backend handedness semantics; this plan must send the selected value
> but must not redesign the CV algorithm.
>
> **Drift check**: `git diff --stat 6730f6e..HEAD -- apps/web/src/app/analyze/page.tsx apps/web/src/lib/agent.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 010; Plan 009 Slice 5 compatibility
- **Category**: correctness | dx
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

Analyze currently performs registration and a long analysis behind one
`Running...` label. Quality requirements are documented but there is no
preflight checklist or phase feedback. The backend already accepts
`dominant_hand`, but the browser omits it, leaving left-handed athletes without
an explicit analysis setting.

## Current state

- `apps/web/src/app/analyze/page.tsx:56-78` performs two sequential requests
  and stores only a boolean busy state.
- `apps/web/src/app/analyze/page.tsx:128-158` has a raw absolute path input,
  stroke select, and pure-footwork checkbox but no dominant-hand field or
  capture preflight.
- `apps/agent/main.py:93-99` accepts `dominant_hand` with default `unknown`.
- `apps/agent/adapters/racket.py:12-25` considers both arms when the value is
  unknown.
- `apps/agent/main.py:363-373` can reject the capture after frame processing.

## Scope

**In scope**: dominant-hand selection and request payload, capture guidance and
validation copy, prerequisite-specific setup copy, analysis phases
(`registering`, `analyzing`, `review-ready`, `failed`), retry behavior, and a
clear link to Capture guide.

**Out of scope**: real-time backend progress, cancellation protocol, file
picker implementation, CV quality thresholds, and result evidence rendering.

## Steps

### Step 1: Add explicit capture and athlete inputs

Add a required or clearly defaulted dominant-hand control with `left`, `right`,
and `unknown`, matching the backend enum. Validate the path before submitting,
explain that the path is local to the Windows machine, and link the strict
capture requirements before the user starts.

**Verify**: the request body contains the selected dominant hand; invalid empty
input is blocked; `npm.cmd run lint -w @bml/web` -> exit 0.

### Step 2: Model the analysis lifecycle

Replace one `busy` label with an explicit phase and an inline status region.
Show that registration, perception/quality gate, and review preparation are
different phases. Keep the submit control disabled during the operation and
make retry possible after failure without losing the selected inputs.

**Verify**: controlled request stubs render every phase and failure state with
no console errors; `npm.cmd run lint -w @bml/web` -> exit 0.

### Step 3: Make quality rejection actionable

When the agent returns a quality-gate error, map the structured response to a
short explanation and link the relevant Capture guide section. Do not display
an opaque JSON response as the user-facing error.

**Verify**: a 422 quality response renders an actionable message; generic 4xx
and network failures remain distinct; web typecheck passes.

## Done criteria

- [ ] Dominant hand is visible, valid, and sent to `/analyze`.
- [ ] Analyze has distinct progress, success, and failure states.
- [ ] Quality rejection explains the next user action.
- [ ] Retry does not clear the user's inputs.
- [ ] No unhandled promise rejection remains in Analyze actions.

## STOP conditions

- Plan 009 changes the dominant-hand request enum or endpoint behavior.
- Real progress requires backend protocol changes.
- A file picker would require a new local-agent upload/capture contract.

## Maintenance notes

Any future analysis option must be reflected in the request summary shown before
submission. The UI must never imply that a browser file path uploads original
video to the cloud.
