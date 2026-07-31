# Plan 027: Guide a first-time user from setup to the next useful action

> **Executor instructions**: Make the home page task-oriented without making
> agent health claims stronger than the existing contract. Preserve offline
> and incomplete-readiness honesty.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/023-local-video-picker.md, plans/024-one-click-windows-agent.md, plans/025-actionable-capture-errors.md, plans/026-plain-language-surface.md
- **Category**: direction | dx
- **Planned at**: commit `679a5c1`, 2026-07-31

## Why this matters

The application has separate pages for Labs, Analyze, Compare, Local Agent,
and Capture Guide, but no visible first-run sequence. A beginner can land on
Analyze before setup, or open Compare before a first run, and must infer the
correct order from error messages.

## Current state

- `apps/web/src/components/AppNav.tsx:6` exposes five peer navigation items.
- `apps/web/src/app/page.tsx:34` always links the primary CTA to `/analyze`.
- `apps/web/src/app/agent/page.tsx:212` shows the current agent base but does
  not provide a next-step link after pairing.
- `apps/web/src/app/analyze/page.tsx:282` renders results but does not offer a
  clear follow-up to progress comparison.
- `apps/web/src/lib/agent.ts:86` already provides readiness state mapping, and
  `agentToken()` can distinguish paired from merely online.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Web typecheck | `npm.cmd run lint` | exit 0 |
| Browser tests | `npm.cmd run test:web` | all pass |
| Full gate | `npm.cmd run verify` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/app/page.tsx`
- `apps/web/src/app/agent/page.tsx`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/src/app/compare/page.tsx`
- `apps/web/src/components/AppNav.tsx`
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- Authentication or cloud account creation.
- Changing readiness seed semantics.
- Removing direct routes for power users.

## Steps

### Step 1: Add an explicit four-step progress surface

Show `Install`, `Pair`, `Choose video`, and `Review results` with one current
state and one next action. Derive the state from health and the local token;
offline must point to setup, online-but-not-ready must point to the missing
prerequisite, and paired users must be sent to Analyze.

**Verify**: controlled browser states render the correct next action for
offline, not-ready, online-unpaired, paired, and completed-analysis cases.

### Step 2: Connect completion actions

After successful pairing, link directly to Analyze. After successful analysis,
link to Compare and keep the result visible. Keep Compare's empty state
truthful when no analysis exists.

**Verify**: Playwright follows the primary CTA through setup and analysis with
no dead-end page or console error.

### Step 3: De-emphasize expert navigation for first run

Use clearer navigation labels and/or a “More tools” grouping while preserving
stable hrefs and active-route semantics. Do not remove direct access for
returning users.

**Verify**: all five routes remain reachable, one active navigation item exists,
and the 390px viewport has no horizontal overflow.

## Done criteria

- [ ] A first-time user sees one next action at every setup state.
- [ ] Pairing leads to video selection and analysis.
- [ ] Analysis leads to review and optional Compare.
- [ ] Expert routes remain available without competing with the first action.
- [ ] Browser suite and full verification pass.

## STOP conditions

- Health and pairing state cannot distinguish “online” from “paired” without a
  new backend contract; stop before guessing.
- A redirect would break deep links or returning users; use explicit CTAs.

## Maintenance notes

Any new prerequisite must add a step state and recovery action. Keep the
progress surface derived from the same readiness mapper used by Analyze and
Agent so pages cannot disagree.
