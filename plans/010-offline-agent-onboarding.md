# Plan 010: Make offline and Local Agent onboarding states truthful and actionable

> **Executor instructions**: Follow this plan step by step. Run each
> verification command before moving to the next step. Do not change the
> Local Agent backend contract in this plan. If Plan 009 changes the health
> response shape, stop and reconcile this plan before continuing.
>
> **Drift check**: `git diff --stat 6730f6e..HEAD -- apps/web/src/app/page.tsx apps/web/src/app/compare/page.tsx apps/web/src/app/agent/page.tsx apps/web/src/app/analyze/page.tsx apps/web/src/lib/agent.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: Plan 009 health contract must remain compatible
- **Category**: bug | dx
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

The home page currently tells users that session metric summaries remain
browseable while the Local Agent is offline, but Compare fetches every summary
from the Local Agent and fails when it is offline. The Agent page also reduces
health to a boolean even though `/health` exposes prerequisite information such
as `poseModelPresent`. The user needs one truthful state model and a clear next
action before attempting analysis.

## Current state

- `apps/web/src/app/page.tsx:40-52` shows `agentOnline` and claims offline users
  can browse session summaries.
- `apps/web/src/app/compare/page.tsx:19-27` stops loading when health is false.
- `apps/web/src/app/agent/page.tsx:12-18` stores health as a boolean plus raw
  JSON text.
- `apps/agent/main.py:194-204` returns `poseModelPresent`, pairing expiry, and
  BYOK status in addition to liveness.
- `apps/web/src/app/analyze/page.tsx:46-48` also consumes only the boolean.
- `apps/web/src/app/agent/page.tsx:20-27` calls health on every URL keystroke.

## Scope

**In scope**: the web health state type/helper, home offline copy and CTA,
Compare offline state, Agent prerequisite presentation, Analyze health state,
and debounced/explicit URL health refresh.

**Out of scope**: backend health changes, cloud summary sync, token storage,
agent installer changes, and the visual evidence-review work in Plan 013.

## Steps

### Step 1: Define a truthful web health view

Extend the existing `agentHealth()` result or add a small pure mapper in
`apps/web/src/lib/agent.ts` so pages can distinguish checking, offline,
online-but-not-ready, and ready. Preserve the raw payload only for diagnostics;
do not expose secrets or pairing codes as the primary status UI.

**Verify**: `npm.cmd run lint -w @bml/web` -> exit 0.

### Step 2: Align home and Compare behavior

Change the home copy so offline means module catalogue only unless a real local
or cloud summary source exists. In Compare, render a clear disabled/CTA state
to `/agent` instead of implying that an empty table is available. Keep the
existing no-runs state for an online agent with no history.

**Verify**: `npm.cmd run lint -w @bml/web` -> exit 0; inspect the three states in
the browser smoke flow: checking, offline, and online/no-runs.

### Step 3: Present prerequisite diagnostics

Replace the raw JSON-first Agent status with readable checks for liveness and
the fields currently returned by `/health`, including pose-model presence and
pairing-code availability. Each failed prerequisite must name the next action.
Keep a collapsible or secondary diagnostic representation only if useful for
debugging.

**Verify**: with a stubbed health response, each prerequisite state renders
without a console error; `npm.cmd run lint -w @bml/web` -> exit 0.

### Step 4: Stop health request storms

Do not call health on every URL keystroke. Persist the URL on an explicit
refresh/blur action or debounce the request, and ignore stale responses when a
new URL has already been entered. Add a visible checking state so the page does
not briefly claim offline during the initial request.

**Verify**: browser network inspection shows at most one request per explicit
refresh or settled URL; `npm.cmd run lint -w @bml/web` -> exit 0.

## Done criteria

- [ ] Home no longer promises unavailable offline summaries.
- [ ] Compare gives a truthful offline CTA and preserves the online empty state.
- [ ] Agent prerequisite failures are actionable and do not display sensitive
      pairing material as the main status.
- [ ] URL editing does not issue one health request per keystroke.
- [ ] Web typecheck passes and no console error appears in the smoke flow.

## STOP conditions

- Plan 009 changes `/health` field names or removes prerequisite fields.
- Implementing truthful offline summaries requires a new cloud API.
- A state cannot be represented without adding backend behavior.

## Maintenance notes

Any new agent prerequisite must be added to the shared health view and tested
as a distinct state. Keep the copy aligned with ADR-001 and ADR-013: original
video remains local and the agent is mandatory for local media review.
