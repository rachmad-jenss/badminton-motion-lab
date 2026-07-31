# Plan 026: Replace internal terminology with beginner-facing language

> **Executor instructions**: Preserve measurement honesty and the existing
> visual system. Use progressive disclosure for diagnostics, not fabricated
> simplification. Keep the app's default language consistent across the
> touched routes.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: plans/023-local-video-picker.md, plans/025-actionable-capture-errors.md
- **Category**: dx | docs | direction
- **Planned at**: commit `679a5c1`, 2026-07-31

## Why this matters

The app is technically transparent but makes users learn the implementation
before they understand the benefit. Terms such as BYOK, pose model, event
detector, frame index, and module readiness belong in technical details, not
the first action a recreational player sees.

## Current state

- `apps/web/src/app/layout.tsx:13` declares `lang="en"` and all primary copy
  is English.
- `apps/web/src/app/page.tsx:63` exposes “Private assembly mode” and benchmark
  terminology.
- `apps/web/src/app/analyze/page.tsx:302` exposes raw perception internals.
- `apps/web/src/app/analyze/page.tsx:401` exposes “AI insight (BYOK optional)”.
- `packages/contracts/src/metrics/catalogue.ts:16` already contains human
  names, descriptions, units, and limitations that can power plain-language
  rendering.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Web typecheck | `npm.cmd run lint` | exit 0 |
| Browser tests | `npm.cmd run test:web` | all pass |
| Full gate | `npm.cmd run verify` | exit 0 |

## Scope

**In scope**:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/app/page.tsx`
- `apps/web/src/app/agent/page.tsx`
- `apps/web/src/app/analyze/page.tsx`
- `apps/web/src/app/capture-guide/page.tsx`
- `apps/web/src/app/compare/page.tsx`
- `apps/web/src/components/AppNav.tsx`
- `apps/web/tests/ui.spec.ts`

**Out of scope**:

- Adding a translation framework.
- Renaming API fields, metric IDs, or database columns.
- Removing technical evidence; it must remain available behind details.

## Steps

### Step 1: Establish user-facing vocabulary

Use plain labels such as “Setup on this PC”, “Choose a video”, “Video check”,
“What we found”, and “Optional written explanation”. Explain technical terms in
short help text where they remain necessary. Keep metric catalogue names and
limitations as the source of truth.

**Verify**: primary headings and buttons contain no unexplained BYOK, frame,
module, or pose-model jargon; technical details remain available to reviewers.

### Step 2: Apply progressive disclosure

Put the useful beginner result first. Move perception internals, raw metric
IDs, provider/API-key controls, and readiness implementation details into
`details` or secondary panels. Never hide confidence, limitations, withheld
values, or evidence links.

**Verify**: a result with measured and withheld metrics shows a plain-language
summary plus confidence/limitation information; technical detail can still be
opened with keyboard.

### Step 3: Simplify the capture guide and setup copy

Replace unexplained yaw/fps/quality-gate language with concrete filming
instructions and short reasons. Keep the exact technical thresholds in a
secondary “Technical requirements” section.

**Verify**: narrow viewport browser tests show readable instructions and no
horizontal overflow; all primary routes retain one accessible heading.

## Done criteria

- [ ] A recreational player can understand the primary action on every route.
- [ ] Technical evidence is still available and honest.
- [ ] API/metric identifiers are not used as the primary copy.
- [ ] Existing accessibility and browser tests pass.

## STOP conditions

- Simplifying copy would hide a quality limitation or imply a medical/coaching
  guarantee.
- A requested language change requires a broad translation architecture not
  present in the repository; keep this plan to consistent plain English and
  report the larger localization decision.

## Maintenance notes

When adding a metric or prerequisite, add both its technical definition and a
beginner-facing explanation. Keep copy changes coordinated with the contracts
catalogue.
