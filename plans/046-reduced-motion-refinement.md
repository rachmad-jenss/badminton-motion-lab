# 046 — Keep feedback under prefers-reduced-motion

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file (~25 lines)

## Problem

`globals.css:1023-1031` forces every animation/transition to 1ms, removing
opacity/color feedback that should survive reduced motion.

## Target

```css
@keyframes fade-in-soft { from { opacity: 0; } to { opacity: 1; } }

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto !important; }
  .hero > *, .shell-backdrop {
    animation: fade-in-soft 200ms ease both;
    animation-delay: 0ms !important;
  }
  .nav-link, .d-btn, .module, .trend-bar, .icon-menu-panel {
    transition-duration: 120ms;
  }
  .nav-link:hover, .d-btn:hover, .module:hover,
  .trend-point:hover .trend-bar,
  .d-btn:active, .nav-link:active, .menu-option:active, .icon-button:active {
    transform: none;
  }
}
```

Replace the old universal block entirely.

## Verification

- **Mechanical**: `npm run typecheck`.
- **Feel check**: emulate reduce — entrances become gentle fades, presses give
  color feedback without movement.
- **Done when**: no 1ms nuke remains.
