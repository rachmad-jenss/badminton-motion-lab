# Plan 015: Establish a consistent accessible application shell

> **Executor instructions**: Keep the existing dark visual identity and local-
> first vocabulary. Make only focused shell/accessibility changes; do not
> redesign analysis content from Plan 013.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx | docs
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

The navigation differs by page, there is no active route indication, and the
global stylesheet defines hover but not designed focus/disabled states. Tables
and dense trend content also lack a responsive containment pattern. This makes
the app harder to navigate with keyboard, assistive technology, and narrow
viewports.

## Current state

- `apps/web/src/app/page.tsx:22-29`, `agent/page.tsx:62-69`, and
  `capture-guide/page.tsx:7-12` expose different nav sets.
- `apps/web/src/app/globals.css:129-143` styles `.btn` and `:hover` only.
- `apps/web/src/app/globals.css:193-204` styles tables without an overflow
  wrapper or responsive rule.
- `apps/web/src/app/layout.tsx:12` sets `lang="en"`; visible copy is English,
  so keep the language declaration consistent unless a localization decision is
  made.

## Scope

**In scope**: shared navigation component or shared nav data, active route
state, focus-visible and disabled styles, status semantics, responsive table
containment, and narrow viewport layout checks.

**Out of scope**: localization, full design-system rewrite, icon library,
animations, and page-specific feature behavior.

## Steps

### Step 1: Unify navigation and route state

Create the smallest shared shell pattern that renders the same primary routes
on every page and marks the current route with visible and semantic state. Keep
Capture guide and Local Agent reachable from Analyze and Compare.

**Verify**: every route has the same primary navigation and exactly one active
route; web typecheck passes.

### Step 2: Add keyboard and control states

Define `:focus-visible`, disabled, and status styles with sufficient contrast.
Use semantic status/alert regions where pages update asynchronously. Do not
remove native focus behavior without replacing it.

**Verify**: keyboard tab traversal visibly identifies the focused control on all
pages; disabled buttons are visually distinct; no console errors.

### Step 3: Contain dense data responsively

Add a shared table wrapper and responsive rules for metrics and Compare trends.
Check checkbox/input layout separately because the global input rule currently
applies to all input types.

**Verify**: at a narrow viewport, no page-level horizontal overflow exists and
tables remain horizontally readable within their panel.

## Done criteria

- [ ] Navigation is consistent and has active route semantics.
- [ ] Keyboard focus and disabled states are visible.
- [ ] Async status messages are announced semantically.
- [ ] Tables and dense content remain usable on narrow viewports.
- [ ] Existing dark theme and copy remain intact.

## STOP conditions

- A shared shell requires a framework change or new dependency.
- Localization is needed to make the `lang` decision correctly.

## Maintenance notes

New pages must use the shared shell and status primitives. Review focus,
disabled, and narrow viewport states whenever a new interactive control is
added.
