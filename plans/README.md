# Improvement plans — Badminton Motion Lab

**Planned at:** pre-git baseline · **2026-07-24**

| Order | Plan | Status |
|------:|------|--------|
| 1 | [001-fix-analyze-jsx-verify](001-fix-analyze-jsx-verify.md) | DONE |
| 2 | [002-guard-wrist-height](002-guard-wrist-height.md) | DONE |
| 3 | [003-frameindex-lookup](003-frameindex-lookup.md) | DONE |
| 4 | [004-remove-fake-footwork-metrics](004-remove-fake-footwork-metrics.md) | DONE |
| 5 | [005-agent-auth-media-allowlist](005-agent-auth-media-allowlist.md) | DONE |
| 6 | [006-real-readiness-benchmarks](006-real-readiness-benchmarks.md) | DONE |
| 7 | [007-single-pass-analyze-offload](007-single-pass-analyze-offload.md) | DONE |
| 8 | [008-docs-supabase-cleanup](008-docs-supabase-cleanup.md) | DONE |
| 9 | [009-all-findings-self-hosted-runner](009-all-findings-self-hosted-runner.md) | IN PROGRESS |

## Plan 009 dependency order

1. Self-hosted runner workflow + readiness enforcement
2. Behavioral tests
3. Domain-valid readiness evidence
4. Pairing, token, and BYOK hardening
5. Event, handedness, and input correctness
6. Analysis resource/history bounds
7. Windows onboarding
8. Contract/version and release-gate closeout

Plan 009 is intentionally delivered as separate atomic commits and is not
complete until the PR, post-merge `main` run, and branch cleanup are verified.

## UI/UX completion plans (2026-07-26)

The following plans address the UI/UX audit findings from commit `6730f6e`.
They are scoped as UI companions to Plan 009; they do not duplicate the
backend security, readiness, handedness, resource, or browser-test work that
Plan 009 already owns.

| Order | Plan | Status | Depends on |
|------:|------|--------|------------|
| 10 | [010-offline-agent-onboarding](010-offline-agent-onboarding.md) | DONE | 009 health contract may evolve; reconcile if it does |
| 11 | [011-pairing-error-recovery](011-pairing-error-recovery.md) | DONE | 010 |
| 12 | [012-analyze-preflight-progress](012-analyze-preflight-progress.md) | DONE | 010; Plan 009 Slice 5 for handedness semantics |
| 13 | [013-evidence-review-surface](013-evidence-review-surface.md) | DONE | 012 |
| 14 | [014-compare-interpretability](014-compare-interpretability.md) | DONE | 010; Plan 009 Slice 6 endpoint work |
| 15 | [015-accessible-shell](015-accessible-shell.md) | DONE | none |
| 16 | [016-web-behavioral-coverage](016-web-behavioral-coverage.md) | DONE | 010-015 |

Recommended implementation order is 010, 011, 012, 013, 014, 015, and 016.
Each implementation slice gets one atomic commit and its own verification
before the next slice starts. The final release gate remains `npm run verify`
plus the browser smoke flow described in Plan 016.

## UI/UX visual polish (2026-07-27)

Non-hero visual alignment to the home-hero design language. Does **not**
redesign `.home-hero`. Builds on completed plans 010–016 and shell polish
`5768334`.

| Order | Plan | Status | Depends on |
|------:|------|--------|------------|
| 17 | [017-visual-polish-non-hero](017-visual-polish-non-hero.md) | DONE | 010–016 DONE |

Findings covered by 017: locked badge CSS, brand keyboard focus, tool-page
contrast, tool headers + CTAs, Capture Guide / Agent Install density, home
notices + Labs restyle, panel rhythm. Deferred: Analyze side-by-side workspace.

## Verification

```bash
npm run verify
# typecheck + web build + agent pytest/smoke + no-synthetic reports
npm run benchmark:fixtures   # requires live agent
```
