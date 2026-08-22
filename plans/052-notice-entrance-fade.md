# 052 - Subtle entrance fade for notice containers

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: LOW
- **Category**: Preventing a jarring change

## Target

```css
@media (prefers-reduced-motion: no-preference) {
  .notice { transition: opacity 150ms ease-out; @starting-style { opacity: 0; } }
}
```

Reduced-motion: instant (no animation).

## Verification

- In-app browser: notice fades in when condition changes.
