# 054 - Symmetric exit for icon menus

- **Status**: DONE
- **Commit**: 18b7980
- **Severity**: LOW
- **Category**: Spatial consistency Apple section 7

## Problem

Menu opens with scale from trigger (Plan 045) but closes instantly.

## Target

Intercept close via ontoggle; apply closing class wait 120ms remove attribute.
Use CSS .icon-menu-panel.closing opacity 0 transform scale 0.96.

## Boundaries

- Do not use JS animation library.
- Keep reduced-motion exit instant.

## Verification

- In-app browser: menu closes with subtle scale-back.
