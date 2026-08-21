# 045 — Popover entry motion + true backdrop crossfade

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: MEDIUM
- **Category**: Physicality / Spatial consistency
- **Estimated scope**: 2 files (~45 lines)

## Problem

`.icon-menu-panel` teleports open. Background swap unmounts the old backdrop
instantly while the new one fades from base (`key` remount, VisualShell.tsx:108),
causing a flash.

## Target

```css
@media (prefers-reduced-motion: no-preference) {
  .icon-menu-panel {
    transform-origin: top right;
    transition: opacity 160ms var(--ease-out), transform 160ms var(--ease-out);
    @starting-style { opacity: 0; transform: scale(0.96); }
  }
}
.shell-backdrop-static { opacity: 1; transform: scale(1.03); }
```

VisualShell: extract `shellVars(preset)` from the inline object; track
`prevPresetId` state; render previous preset as a `.shell-backdrop-static`
layer before the active one; clear after 350ms via effect.

## Boundaries

- Do NOT animate menu close (entry-only).
- Do NOT introduce a motion library.

## Verification

- **Mechanical**: `npm run typecheck`; theme/background Playwright tests pass.
- **Feel check**: menus scale from their trigger corner; switching presets
  never flashes the base color.
- **Done when**: crossfade verified in slow motion.
