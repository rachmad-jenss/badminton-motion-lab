# 050 - Split motion tokens for reveal duration

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: LOW
- **Category**: Token cohesion

## Problem

--motion-medium 520ms used once for home hero; tool pages override to
hardcoded 280ms.

## Target

```css
--motion-reveal: 280ms;
.page-tool .hero > * { animation-duration: var(--motion-reveal); }
```

## Verification

- npm run typecheck
