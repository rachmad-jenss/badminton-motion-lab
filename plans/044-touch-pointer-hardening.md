# 044 — Press feedback, hover gating, touch-action, safe areas

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: HIGH
- **Category**: Accessibility / Mobile-native feel
- **Estimated scope**: 2 files (~50 lines)

## Problem

No `:active` press feedback anywhere; hover transforms/colors are ungated
(sticky hover on touch); no `touch-action: manipulation`; viewport lacks
`viewport-fit=cover` and the fixed header ignores safe-area insets.

## Target

```css
button, a, summary, select { touch-action: manipulation; }

.d-btn:active, .nav-link:active, .menu-option:active, .icon-button:active {
  transform: scale(0.97);
}

@media (hover: hover) and (pointer: fine) {
  /* move existing :hover declarations here */
}
```

`layout.tsx`: export `const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };`

Header insets use `top: max(1rem, env(safe-area-inset-top))` and matching
left/right maxes; mobile breakpoint uses `max(0.7rem, env(safe-area-inset-top))`.

## Verification

- **Mechanical**: `npm run typecheck`; narrow-viewport Playwright test passes.
- **Feel check**: desktop hover unchanged; emulated touch shows no stuck lift
  and visible press scale; notch simulation keeps header clear.
- **Done when**: zero ungated `:hover` movement remains.
