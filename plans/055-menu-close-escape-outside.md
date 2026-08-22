# 055 - Menu close on Escape and outside click
- **Status**: TODO
- **Commit**: 0d9066d
- **Severity**: P2
- **Category**: Accessibility / Apple interaction contract

## Problem

Icon menus (theme, background) in VisualShell use native <details> toggle.
They do not close on Escape key or outside click. Keyboard users must Tab out;
touch users tapping outside do not dismiss.

## Target

In VisualShell.tsx:
1. Add useEffect that listens for document pointerdown; if the event target is outside the open <details> element and it is open, call closeMenuWithAnimation().
2. Add onKeyDown on each <summary> for Escape: preventDefault + closeMenuWithAnimation().

## Boundaries

- Do not add a library.
- Do not change open animation.
- Keep reduced-motion exit instant (existing .closing CSS handles this).

## Verification

- npm run typecheck
- In-app browser: open menu, press Escape, confirm close; click outside, confirm close.
