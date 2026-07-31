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
| 9 | [009-all-findings-self-hosted-runner](009-all-findings-self-hosted-runner.md) | DONE |

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

## Follow-up integrity and operations plans (2026-07-31)

The live audit found correctness, provenance, validation, tenant-isolation,
retention, and runner-lifecycle gaps that are independent of the completed UI
plans. These plans are executed in dependency order and each implementation
slice is verified before its atomic commit.

| Order | Plan | Status | Depends on |
|------:|------|--------|------------|
| 18 | [018-analysis-integrity-and-inputs](018-analysis-integrity-and-inputs.md) | DONE | 009; 016 |
| 19 | [019-provenance-manifest-and-byok](019-provenance-manifest-and-byok.md) | DONE | 018 |
| 20 | [020-runner-and-retention](020-runner-and-retention.md) | DONE | 018 |
| 21 | [021-tenant-integrity](021-tenant-integrity.md) | DONE | 018; 019 |
| 22 | [022-release-and-plan-reconciliation](022-release-and-plan-reconciliation.md) | DONE | 018-021 |

## Beginner onboarding plans (2026-07-31)

These plans implement the five verified usability findings for ordinary
Windows users. They preserve ADR-001/ADR-013 local-first processing and do not
unlock readiness modules without domain-valid evidence.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 23 | [023-local-video-picker](023-local-video-picker.md) | P1 | DONE | none |
| 24 | [024-one-click-windows-agent](024-one-click-windows-agent.md) | P1 | DONE | none |
| 25 | [025-actionable-capture-errors](025-actionable-capture-errors.md) | P1 | TODO | 023 |
| 26 | [026-plain-language-surface](026-plain-language-surface.md) | P1 | TODO | 023, 025 |
| 27 | [027-guided-first-run](027-guided-first-run.md) | P1 | TODO | 023-026 |

Recommended implementation order is 023, 024, 025, 026, and 027. Each slice
gets one atomic commit and its own focused verification before the next slice.

The existing readiness blocker remains separate: `readiness:integrity` is
truthful while `complete=false`; no synthetic fixture may be used to make it
green.

The completion gate is the repository verification suite, the browser suite
against the running website, a clean review of the intended diff, green PR CI,
green post-merge `main`, and removal of only the merged feature branch.

## Verification

```bash
npm run verify
# typecheck + web build + agent pytest/smoke + no-synthetic reports
npm run benchmark:fixtures   # requires live agent
```
