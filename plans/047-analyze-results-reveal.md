# 047 — Reveal analysis results + phase-label swap

- **Status**: TODO
- **Commit**: 2a659f2
- **Severity**: LOW-MEDIUM
- **Category**: Missed opportunity
- **Estimated scope**: 2 files (~30 lines)

## Problem

Analysis results pop in instantly after busy-to-ready (analyze/page.tsx:362-499);
the phase label swaps raw text (:206-212,341).

## Target

```css
.result-reveal { animation: rise-in 240ms var(--ease-out) both; }
.phase-swap { display: inline-block; animation: fade-in-soft 150ms var(--ease-out); }
```

TSX: add `result-reveal` plus incremental inline animationDelay (index times
60ms) to the six post-result blocks. Render phase label as
`<span key={phase} className="phase-swap">{phaseLabel}</span>`.

## Boundaries

- Do NOT animate table internal data (functional read).
- Do NOT add spinners.

## Verification

- **Mechanical**: `npm run typecheck`; analysis success Playwright test passes.
- **Feel check**: results cascade once per run; rapid re-runs restart cleanly;
  reduced-motion shows fades only (via Plan 046).
- **Done when**: reveal feels like completion, not decoration.
