# 043 — Motion easing tokens + tighter hero/tool entrances

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: MEDIUM
- **Category**: Easing & duration / Tokens
- **Estimated scope**: 1 file (~15 edits)

## Problem

Only duration tokens exist (`globals.css:84-85`); every transition hand-types
`ease`. Hero entrance is 520ms with up to 240ms delay on tool pages users
navigate constantly; backdrop swap eases wrong (`ease`, 700ms).

## Target

```css
:root {
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
}
```

- Replace `ease` with `var(--ease-out)` wherever the transition list contains
  transform (`:298`, `:574`, `:682`, `:855`, `:917`). Pure color hovers may
  keep `ease`.
- Add `.page-tool .hero > * { animation-duration: 280ms; }` after stagger rules.
- `.shell-backdrop` animation becomes `backdrop-in 300ms var(--ease-out) both`.

## Boundaries

- Do NOT rename existing duration tokens.
- Do NOT animate anything new.

## Verification

- **Mechanical**: `npm run typecheck`.
- **Feel check**: tool headers settle fast; background swap eases out crisply.
- **Done when**: no bare `ease` remains on transform-bearing transitions.
