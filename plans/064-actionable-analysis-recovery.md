# Plan 064: Turn analysis failures into adjacent recovery actions

> **Executor instructions**: Keep the agent error contract safe and preserve
> selected files, paths, and analysis options when offering retry. Never show
> bearer tokens, provider keys, raw internal responses, or sensitive filesystem
> details. Do not relax quality gates or change CV behavior.
>
> **Drift check (run first)**: `git diff --stat bd0de95..HEAD -- apps/web/src/lib/agent.ts apps/web/src/app/analyze/page.tsx apps/web/tests/ui.spec.ts apps/agent/main.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/062-guided-local-connection-funnel.md
- **Category**: bug
- **Planned at**: commit `bd0de95`, 2026-10-04

## Why this matters

The Local Agent already returns structured recovery data for missing files,
unsupported media, quality rejection, memory limits, and pairing failures. The
Analyze page currently renders the recovery action as plain text, so the user
must navigate manually. Worse, `agentErrorInfo` treats any payload-less HTTP
422 as a quality-gate failure even when it could be a registration or contract
error. That sends users to the wrong fix and makes the analysis flow feel
unreliable.

Render one safe explanation beside the failed action, add the relevant Setup or
Capture guide link, and keep retry local to the same selected input.

## Current state

- `apps/web/src/lib/agent.ts:58-69` types `code`, `message`, `action`, and
  failed quality checks, but `AgentErrorInfo` has no typed recovery destination.
- `apps/web/src/lib/agent.ts:171-187` maps 401 and 410, preserves structured
  payload actions, but line 182 labels every payload-less 422 as a quality
  failure.
- `apps/web/src/app/analyze/page.tsx:148-153` stores the error but does not
  provide a retry or destination action.
- `apps/web/src/app/analyze/page.tsx:342-359` renders `errorInfo.action` as a
  paragraph and renders failed checks, but no Setup/Capture guide link is
  available next to the error.
- `apps/agent/main.py:104-140` already maps known media errors to stable
  codes/actions; `main.py:709-716` returns `quality_rejected`; and
  `main.py:914-926` returns a distinct memory-limit code.
- `apps/web/tests/ui.spec.ts:326-378` covers a structured quality failure,
  but there is no regression assertion for a generic 422, 401, 410, or memory
  limit recovery action.

Plan 025 previously marked this area DONE, so treat this as a follow-up for
the current drift: verify the existing contract before adding any backend
fields and keep the change narrow.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck/lint | `npm.cmd run lint` | exit 0, no TypeScript errors |
| Browser behavior | `npm.cmd run test:web` | all Playwright tests pass |
| Agent regression suite | `npm.cmd run test:agent` | all agent tests pass |
| Repository typecheck | `npm.cmd run typecheck` | contracts and web checks exit 0 |

## Scope

**In scope**:

- `apps/web/src/lib/agent.ts`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/tests/ui.spec.ts`
- `apps/agent/main.py` or agent tests only if a current response is missing a
  stable code required by the existing UI contract; do not change CV logic.

**Out of scope**:

- Quality thresholds, readiness gates, metric truth, or analysis algorithms.
- Raw response/body rendering, provider responses, bearer tokens, or API keys.
- A new error framework or global toast system.
- Reworking the pairing code interaction covered by Plan 063.

## Steps

### Step 1: Make error classification explicit and safe

Extend `AgentErrorInfo` with a small finite recovery kind/destination such as
`setup`, `capture-guide`, `retry`, or `none`. Select it from the stable
payload code and HTTP status. Keep 401 as pairing/setup, 410 as relink/retry,
quality rejection as capture guidance, and memory-limit as retry with a
shorter/lower-resolution video. A payload-less 422 must remain generic; it
must not claim the quality gate failed without `quality_rejected` evidence.

Preserve existing safe messages. If a generic network or server response is
not safe to show, use the existing fallback rather than copying raw response
text into the browser.

**Verify**: focused tests produce the expected kind/message for structured
quality rejection, generic 422, 401, 410, and memory-limit responses; raw
internal response text is absent.

### Step 2: Render the recovery beside the failure

In `analyze/page.tsx`, keep the stable `role="status"` phase region and use
`role="alert"` only for a failed request. Render the safe message, the
structured action sentence, and one keyboard-accessible destination/retry
control. Link pairing failures to `/agent` and capture-quality/media failures
to `/capture-guide` where appropriate. The retry path must preserve the
selected file or local path and all analysis options.

Do not claim a result exists after failure; keep the existing result hidden
until a complete response arrives.

**Verify**: controlled browser states show the right CTA for 401, 410,
quality rejection, generic 422, and memory-limit failure; the chosen input is
still selected after the user returns/retries.

### Step 3: Add regression coverage without duplicating backend truth

Extend `apps/web/tests/ui.spec.ts` using the current route-mocking style. Add
one assertion that a payload-less 422 does not say “quality gate”, one that a
401 links to Setup, one that a structured quality failure links to Capture
guide, and one that an expired local media response gives a retry/relink
action. Add or update agent contract tests only if the existing backend
responses cannot satisfy these cases.

**Verify**: `npm.cmd run test:web`, `npm.cmd run test:agent`, `npm.cmd run lint`,
and `npm.cmd run typecheck` all pass.

## Test plan

- Model the existing structured quality response in `ui.spec.ts` and keep its
  measured-versus-required checks visible.
- Add payload-less 422 coverage using a harmless generic message and assert
  that the UI does not call it a quality failure.
- Add 401, 410, and 503/memory-limit cases with safe response bodies; assert
  links/actions and absence of raw server text.
- Verify retry preserves the selected file and selected stroke/hand options.

## Done criteria

- [ ] Every supported analysis failure has one clear next action adjacent to
      the error.
- [ ] Generic 422 responses are not mislabeled as quality rejection.
- [ ] Retry preserves user input and never exposes raw sensitive responses.
- [ ] `npm.cmd run test:web`, `npm.cmd run test:agent`, `npm.cmd run lint`, and
      `npm.cmd run typecheck` pass.
- [ ] No quality threshold or CV behavior changes.

## STOP conditions

- The backend uses a conflicting error code for quality rejection; stop and
  report the contract mismatch before changing the mapping.
- A recovery link would require exposing a filesystem path, secret, or raw
  provider response; keep the message generic and report the limitation.
- Retry would require re-uploading or mutating the user's original video
  outside the existing local-agent contract.

## Maintenance notes

Every new agent error code must be assigned one safe browser recovery kind and
one test. Keep quality evidence and withheld metrics separate from recovery
copy; the UI may explain what failed without weakening the readiness gate.
