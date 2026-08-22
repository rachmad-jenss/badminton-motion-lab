# 049 - Fix concentric radius and raise menu touch target

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: LOW
- **Category**: Visual craft / accessibility

## Problem

.icon-menu-panel radius 1.1rem padding 0.55rem; .menu-option radius
0.75rem. Concentric requires inner = outer minus padding = about 0.65rem.
Also .menu-option min-height 2.25rem = 36px below WCAG 2.5.5 (44px).

## Target

```css
.menu-option { border-radius: 0.65rem; min-height: 2.5rem; }
```

## Verification

- In-app browser: menu options visually nest inside panel radius.
