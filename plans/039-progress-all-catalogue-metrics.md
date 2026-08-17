# Plan 039: Progress page tracks the full metric catalogue

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0046446..HEAD -- apps/web/src/app/compare apps/web/tests/ui.spec.ts`

## Status

- **Priority**: P3
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: product-gap | feature
- **Planned at**: commit `0046446`, 2026-08-17

## Why this matters

The Progress page hardcodes 4 metric IDs
(`apps/web/src/app/compare/page.tsx:15-20`) while the agent produces 14
catalogued metrics (`packages/contracts/src/metrics/catalogue.ts`), including
all footwork metrics (`recovery_path_length_court`, `court_coverage_area`,
`path_efficiency`, `landing_symmetry`, `first_step_latency`,
`split_step_count`, `stance_width_contact`, `trunk_lean_contact`,
`wrist_height_ratio_contact`, `shuttle_approach_angle`). Users cannot track
progress on most of what the product measures, and the hardcoded list silently
omits everything else.

## Current state

- `apps/web/src/app/compare/page.tsx:15-20`:
  ```ts
  const METRICS = [
    "elbow_angle_contact",
    "shoulder_abduction_contact",
    "split_step_timing_to_contact",
    "racket_speed_proxy_contact",
  ] as const;
  ```
- The page already imports `METRIC_CATALOGUE` from `@bml/contracts` and uses
  `metricDefinition(id)` for labels/descriptions.
- `/metrics/series` (agent) returns points for any metric ID and skips
  withheld/null values, so unknown-to-history metrics yield `[]` — the page
  already renders `-` for empty series and skips empty trend groups
  (`points.length === 0 → return null`).

## Scope

**In scope**: `apps/web/src/app/compare/page.tsx`; `apps/web/tests/ui.spec.ts`
(compare tests only, if assertions need updating).

**Out of scope**: agent `/metrics/series`; metric catalogue content;
`compare.ts` helpers.

## Steps

### Step 1: Derive the metric list from the catalogue

Replace the hardcoded `METRICS` const with:

```ts
const METRICS = METRIC_CATALOGUE.map((m) => m.id);
```

(Keep the array order = catalogue order. `METRIC_CATALOGUE` is already
imported in this file.)

**Verify**: `npm.cmd run test -w @bml/web` → exit 0.

### Step 2: Check empty-state rendering

The table now shows up to 14 rows. Confirm each empty series renders `-` in
Previous/Current/Change and `0` Sessions (existing code paths), and trend
groups render only when `points.length > 0` (existing guard). No component
changes expected.

**Verify**: `npx.cmd playwright test` (compare tests) passes.

### Step 3: Strengthen the compare test

In `apps/web/tests/ui.spec.ts` "Compare keeps partial results and hides raw
metric errors": after the existing assertions, assert a previously-missing
metric is now present — e.g.
`await expect(page.locator("td").filter({ hasText: "Shuttle approach angle" }).first()).toBeVisible();`
This proves catalogue-driven rendering beyond the old 4.

**Verify**: the full `ui.spec.ts` suite passes.

## Test plan

- Existing compare tests keep passing unchanged (they mock per-metric series
  and fall back to empty arrays for the rest).
- One new assertion proves a non-hardcoded metric renders.

## Done criteria

- [ ] No hardcoded metric ID list remains in `compare/page.tsx` (grep for the old 4 IDs returns only agent/catalogue sources)
- [ ] Compare page renders a row per catalogue metric (14) with `-`/0 for empty history
- [ ] `npm run test -w @bml/web` and the compare browser tests pass
- [ ] `plans/README.md` status row updated

## STOP conditions

- If the page becomes unusable with 14 rows (e.g., layout regression beyond
  normal table growth) → stop and report rather than trimming the catalogue.
- If `METRIC_CATALOGUE` ids ever diverge from what the agent produces, the
  table will show empty rows for missing metrics — that is acceptable and
  honest; do not filter them out.

## Maintenance notes

- Adding a metric to `catalogue.ts` automatically adds it to Progress — that is
  the intended single-source behavior.
- If a future metric is intentionally private (never user-facing), add an
  explicit exclusion with a comment; do not reintroduce a hardcoded include-list.
