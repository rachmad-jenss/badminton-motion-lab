# 051 - Animate details accordion expand and collapse

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: LOW-MEDIUM
- **Category**: State indication

## Problem

All details accordions snap open or closed instantly.

## Target

```css
@media (prefers-reduced-motion: no-preference) {
  .install-details,
  .advanced-details {
    interpolate-size: allow-keywords;
  }
  .install-details::details-content,
  .advanced-details::details-content {
    transition: height 180ms var(--ease-out), content-visibility 180ms allow-discrete;
  }
}
```

Graceful degradation to instant in unsupported browsers.

## Verification

- In-app browser: smooth expand on Chrome 131+; instant fallback elsewhere.
