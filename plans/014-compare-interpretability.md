# Plan 014: Make Compare interpretable and resilient

> **Executor instructions**: Use the metric catalogue and existing run data;
> do not add demo data. Plan 009 Slice 6 may add a multi-metric endpoint. If it
> lands first, use it; otherwise keep the current endpoint as a compatibility
> fallback without duplicating fetching logic.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: Plan 010; Plan 009 Slice 6 endpoint work
- **Category**: direction | perf | correctness
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

Compare currently presents raw metric IDs, omits units, treats every positive
delta as an improvement, and uses four independent requests that fail as one
unit. The result is technically populated but difficult to interpret as player
progress.

## Current state

- `apps/web/src/app/compare/page.tsx:8-14` defines raw metric IDs.
- `apps/web/src/app/compare/page.tsx:33-44` uses `Promise.all` for four separate
  series requests.
- `apps/web/src/app/compare/page.tsx:89-111` shows raw IDs and colors delta by
  sign only; unit and metric direction are absent.
- `apps/web/src/app/compare/page.tsx:127-154` draws bars without axis, scale
  labels, or a bounded mobile layout.
- `apps/web/src/lib/compare.ts:1-8` already carries `unit` in each point.

## Scope

**In scope**: metric metadata presentation, direction-aware delta labels,
partial-error handling, selected session context, and readable responsive trend
visuals.

**Out of scope**: new metrics, backend history retention, a charting library,
and the Plan 009 multi-metric API implementation itself.

## Steps

### Step 1: Add metric display metadata

Create a small UI metadata map backed by the contracts catalogue. Include label,
unit, description, and whether higher/lower is favorable only when the domain
definition supports that conclusion. Otherwise label the delta as change, not
improvement.

**Verify**: all four configured metrics render a human label and unit; web
typecheck passes.

### Step 2: Harden loading and partial failure states

Prefer the multi-metric endpoint when available. If the compatibility path is
used, retain successful series and show a per-metric error rather than blanking
the entire page. Keep loading, offline, no-runs, and partial-data states
distinct.

**Verify**: one failed metric request leaves the other series visible and
actionable; no-runs remains truthful; `npm.cmd run lint -w @bml/web` passes.

### Step 3: Improve comparison context and trends

Show session dates/titles, units, and the exact previous/current records.
Bound or horizontally scroll dense trend data, add readable labels, and keep
the visualization usable at narrow widths without introducing a new dependency.

**Verify**: seeded multi-session data remains readable at desktop and mobile
viewport sizes; no horizontal page overflow is introduced.

## Done criteria

- [ ] Compare uses human-readable names and units.
- [ ] Delta color/text does not claim improvement without domain evidence.
- [ ] Partial fetch failure does not erase successful data.
- [ ] Trend view has context and remains usable on narrow screens.
- [ ] No demo or synthetic session data is added.

## STOP conditions

- Plan 009 changes the series response shape incompatibly.
- Directionality cannot be established from the metric catalogue; use neutral
  change language instead.

## Maintenance notes

When adding a metric to Compare, add its catalogue metadata and an explicit
direction decision. Keep historical data ordering in `compareLatest` intact.
