# 042 — Style the maintainer label surface

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: HIGH (usability) / low traffic
- **Category**: Design-system completeness
- **Estimated scope**: 1 file (~40 lines CSS)

## Problem

`apps/web/src/app/label/page.tsx` uses `.page-label`, `.form-row`,
`.corner-grid`, `.label-video`, `.advanced-details`; home uses `.beta-notice`.
None are defined in `globals.css` (verified against compiled CSS too).
Court-corner inputs stack vertically instead of gridding; the video has no
radius/max-height; advanced summaries are unstyled.

## Target

```css
.form-row { display: grid; gap: 0.4rem; margin-bottom: 1rem; max-width: 32rem; }
.form-row label { margin-bottom: 0; }
.corner-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.8rem; }
.corner-grid .form-row { margin-bottom: 0; }
.label-video { width: 100%; max-height: 420px; border-radius: var(--radius-card); background: var(--color-base-300); }
.advanced-details { margin-top: 0.85rem; }
.advanced-details summary { cursor: pointer; color: var(--token-ink-muted); font-size: 0.9rem; font-weight: 600; }
.beta-notice { border-left-color: var(--color-warning); }
```

Place beside sibling patterns (`.install-details` is the exemplar).

## Verification

- **Mechanical**: `npm run typecheck`; existing labeling Playwright test passes.
- **Feel check**: /label shows corner inputs in a responsive grid; video is
  rounded and height-capped; beta notice reads as caution on home.
- **Done when**: no undefined-class layout surprises remain on /label.
