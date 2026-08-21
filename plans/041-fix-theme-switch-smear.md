# 041 — Suppress transitions during theme/background switches

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: HIGH
- **Category**: Interruptibility / Cohesion
- **Estimated scope**: 2 files (~20 lines)

## Problem

`apps/web/src/app/globals.css:298`, `:574`, `:682` transition `color`,
`background`, `border-color`, and `box-shadow`. Switching color theme or
background preset (`apps/web/src/components/VisualShell.tsx:85-93`) rewrites
root CSS variables, so every transitioning element animates at once and the
whole page smears instead of snapping.

## Target

A temporary attribute disables all transitions for one paint, then is removed:

```css
html[data-theme-switching] *,
html[data-theme-switching] *::before,
html[data-theme-switching] *::after {
  transition: none !important;
}
```

Call `suppressTransitions()` (set attribute, force reflow, remove after two
rAF frames) at the top of both `changeTheme` and `changeBackground`.

## Verification

- **Mechanical**: `npm run typecheck` passes.
- **Feel check**: toggle light/dark rapidly; colors snap with no visible
  cross-fade wave. Same for switching background presets.
- **Done when**: no transition smear on either switch.
