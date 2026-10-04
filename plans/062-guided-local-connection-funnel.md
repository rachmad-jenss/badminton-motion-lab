# Plan 062: Make the local connection funnel state-directed

> **Executor instructions**: Follow this plan step by step. Keep the current
> local-first contract and the intentional experimental-analysis path. The
> connection/setup action must become the primary next step for users who are
> not ready; experimental analysis may remain available as an explicit
> secondary action. Do not change CV, readiness evidence, or authentication
> semantics.
>
> **Drift check (run first)**: `git diff --stat bd0de95..HEAD -- apps/web/src/lib/agent.ts apps/web/src/components/OnboardingSteps.tsx apps/web/src/app/page.tsx apps/web/src/app/agent/page.tsx apps/web/src/app/analyze/page.tsx apps/web/tests/ui.spec.ts`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `bd0de95`, 2026-10-04

## Why this matters

The product already knows whether the helper app is checking, offline,
incomplete, ready-but-unpaired, or ready-and-paired, but the primary actions do
not consistently follow that state. A first-time visitor is sent to Analyze
even when the onboarding component says the next action is Setup or Pair, and
the setup page still says “Go to pairing” after pairing is complete. This makes
the user infer the connection sequence from status text and error responses.

The recent `bd0de95` change intentionally keeps experimental analysis open
before readiness. Preserve that choice, but make it an explicit secondary
route so it does not compete with the supported connect-first path.

## Current state

- `apps/web/src/lib/agent.ts:48-49,133-150` exposes four health states and
  labels them, but does not combine health readiness with URL-scoped token
  presence into one reusable next-action model.
- `apps/web/src/components/OnboardingSteps.tsx:12-69` already derives the
  desired next action from `readiness`, `paired`, and `completed`; use this
  vocabulary as the source of truth instead of creating a second set of
  labels.
- `apps/web/src/app/page.tsx:31-38` always sets `primaryHref` to `/analyze`.
  Only the label changes to “Try experimental analysis” when the user is not
  ready. The same page renders the state-directed onboarding surface at
  `page.tsx:67`.
- `apps/web/src/app/agent/page.tsx:125-151` computes `readyToAnalyze`, but
  always renders the hero CTA `Go to pairing`; the post-pair link exists only
  in the transient status at `agent/page.tsx:258-261`.
- `apps/web/src/app/analyze/page.tsx:113-118,224-253,335-340` keeps the
  Analyze button enabled before pairing by intentional product choice. Its
  non-ready notice mixes a recoverable setup instruction, an alert role, and
  the experimental invitation in one block.
- `apps/web/tests/ui.spec.ts:51-62,100-114` explicitly locks the current
  offline home CTA and pre-pair experimental behavior. These tests must be
  updated to assert the new primary/secondary distinction, not deleted.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck/lint | `npm.cmd run lint` | exit 0, no TypeScript errors |
| Browser behavior | `npm.cmd run test:web` | all Playwright tests pass |
| Repository typecheck | `npm.cmd run typecheck` | contracts build and web checks exit 0 |
| Diff hygiene | `git diff --check` | no whitespace errors |

## Scope

**In scope** (the only source/test files to modify):

- `apps/web/src/lib/agent.ts` — add a small shared connection/next-action
  helper only if it removes duplicated state branching.
- `apps/web/src/components/OnboardingSteps.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/agent/page.tsx`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- `apps/agent/**`, CV behavior, pairing/token TTLs, or readiness evidence.
- Removing `/analyze`, `/agent`, `/compare`, or any direct route.
- Removing experimental analysis before pairing.
- A new state-management library, translation system, or navigation rewrite.
- Unrelated visual-shell, theme, or motion polish.

## Steps

### Step 1: Define one connection-to-next-action model

Add a typed helper or shared decision table that distinguishes at least:

1. checking — send the user to Check setup;
2. offline — send the user to Start setup on this PC;
3. online but incomplete — send the user to Finish setup;
4. ready but unpaired — send the user to Pair this browser;
5. ready and paired — send the user to Choose a video.

Keep `paired` as the existing URL-scoped local-token signal. Do not label a
token as server-valid until a protected request succeeds; that boundary belongs
to Plan 064. Reuse the existing “Start setup”, “Pair browser”, “Choose a
video”, and “Review results” vocabulary.

**Verify**: a focused unit/helper check or deterministic browser assertions
cover all five states and produce one label plus one href per state; no
readiness type or API request shape changes.

### Step 2: Make Home and Setup lead with the next supported action

On `page.tsx`, make the state-directed action the filled primary CTA. Keep
“Try experimental analysis” as a clearly secondary ghost link only when the
user is not ready, and keep `/analyze` reachable for power users. Do not show
the temporary “checking” state as a confident ready/experimental decision
before health resolves.

On `agent/page.tsx`, change the hero CTA to “Choose a video” linking to
`/analyze` when `readyToAnalyze` is true; otherwise keep a pairing/setup CTA.
Keep the existing setup checklist and post-pair success link, but make the
hero action work after a reload as well as immediately after pairing.

**Verify**: Playwright covers offline, not-ready, ready-unpaired, and
ready-paired Home states, plus the paired Setup hero. Each state has exactly
one filled next action and the experimental route remains visible only as a
secondary option when applicable.

### Step 3: Clarify the Analyze precondition without closing the experiment

Keep the Analyze button enabled after a video is selected when the agent is
not ready, because `bd0de95` intentionally supports experimental attempts.
However, split the non-ready surface into a normal setup guidance region with
primary “Open setup” action and a separately labelled secondary “Try
experimental analysis” path. Use `role="status"` for checking/instructional
state and reserve `role="alert"` for an actual failed request. The copy must
state that connection is required for the supported flow and that the
experimental attempt may return a setup error.

**Verify**: the pre-pair test still proves the Analyze button can be enabled,
while the accessible primary action is Setup/Pair and no instructional notice
is announced as an urgent error.

### Step 4: Add regression coverage and finish within scope

Update `apps/web/tests/ui.spec.ts` using the existing route mocks and
single-worker Playwright setup. Add assertions for the state matrix, setup
hero after pairing, the secondary experimental link, one active primary
action, and the existing narrow viewport/no-console-error contract.

**Verify**: `npm.cmd run test:web`, `npm.cmd run lint`, `npm.cmd run typecheck`,
and `git diff --check` all pass; `git status --short` lists only the scoped
source/test files plus any pre-existing user changes.

## Test plan

- Extend the existing `mockHealth`, `clearAgentStorage`, and
  `seedPairedBrowser` helpers in `apps/web/tests/ui.spec.ts`.
- Test health states: offline (503), online without model, online/unpaired,
  and online/paired.
- Test that Home’s filled CTA points to `/agent`, `/agent#pair`, or `/analyze`
  as appropriate.
- Test that the intentional pre-pair Analyze behavior remains available but
  is presented as secondary to Setup.
- Test that Setup’s hero changes from pairing to choosing a video after a
  paired token is present.

## Done criteria

- [ ] The supported first-run path is Home → Setup → Pair → Analyze.
- [ ] Home and Setup expose one state-correct filled next action after health
      resolves.
- [ ] Experimental pre-pair Analyze remains available but is not the primary
      connection instruction.
- [ ] Checking/instructional copy is not announced as an urgent alert.
- [ ] `npm.cmd run test:web`, `npm.cmd run lint`, and
      `npm.cmd run typecheck` pass.
- [ ] No files outside the scope list are modified.

## STOP conditions

- The product owner decides experimental analysis must be removed rather than
  demoted; stop and request that decision instead of silently changing the
  contract.
- Health and token state cannot distinguish the five states without a new
  backend field; stop before inventing a server-valid claim.
- The change requires rewriting navigation or changing route URLs.

## Maintenance notes

Any new local prerequisite must be added to the shared next-action model and
covered in the Home, Setup, and Analyze state matrix. Keep connection state
copy consistent with `OnboardingSteps`; do not create page-specific synonyms.
