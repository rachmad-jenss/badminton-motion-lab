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
| 25 | [025-actionable-capture-errors](025-actionable-capture-errors.md) | P1 | DONE | 023 |
| 26 | [026-plain-language-surface](026-plain-language-surface.md) | P1 | DONE | 023, 025 |
| 27 | [027-guided-first-run](027-guided-first-run.md) | P1 | DONE | 023-026 |

Recommended implementation order is 023, 024, 025, 026, and 027. Each slice
gets one atomic commit and its own focused verification before the next slice.

The existing readiness blocker remains separate: `readiness:integrity` is
truthful while `complete=false`; no synthetic fixture may be used to make it
green.

## Domain readiness roadmap (2026-08-16)

Decision/roadmap record from the approved grilling session. Defines the data
strategy (ShuttleSet + own capture), evidence rules, two-gate launch posture
(Beta <= 1 month; Public-ready = zero locked, no deadline), and phased
execution. This plan authorizes nothing beyond itself.

| Order | Plan | Status | Depends on |
|------:|------|--------|------------|
| 28 | [028-domain-readiness-roadmap](028-domain-readiness-roadmap.md) | IN PROGRESS (code phases merged, PR #11) | 018–022; verified gate set |

The completion gate is the repository verification suite, the browser suite
against the running website, a clean review of the intended diff, green PR CI,
green post-merge `main`, and removal of only the merged feature branch.

## Improve round 2026-08-16 (plans 029-035)

Audit of commit `aa1479a` (2026-08-16) — read-only survey of the agent pipeline, web
app, scripts, CI, and docs. All 7 findings are planned below. Recommended execution
order respects dependencies: 032 (shared inventory) lands before 030 (fixture-runner
guard) because both touch the same scripts; the rest are independent.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 1 | [029-bound-analyze-memory](029-bound-analyze-memory.md) | P1 | DONE | none |
| 2 | [031-pose-visibility-dead-code](031-pose-visibility-dead-code.md) | P2 | DONE | none |
| 3 | [032-module-inventory-single-source](032-module-inventory-single-source.md) | P2 | DONE | none |
| 4 | [030-fixture-runner-report-guard](030-fixture-runner-report-guard.md) | P1 | DONE | 032 |
| 5 | [033-agent-retention-and-series-index](033-agent-retention-and-series-index.md) | P2 | DONE | none |
| 6 | [034-ignore-test-artifacts](034-ignore-test-artifacts.md) | P2 | DONE | none |
| 7 | [035-supabase-docs-honesty](035-supabase-docs-honesty.md) | P3 | DONE | none |

Dependency notes: 030 must follow 032 so the fixture runner keeps using the shared
inventory after its write-guard lands. 029 (pixel budget) is independent but P1 — it
directly addresses the anti-OOM requirement.


## Improve round 2026-08-17 (plans 036-040)

Audit of commit `0046446` — all 5 findings planned below. Execution order: 037, 038, 039,
040 (small, independent) then 036 (dependency upgrade) so each landing is verified before
the Next 16 upgrade runs. Plan 036 intentionally lands last: its verification is the whole
repository suite.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 1 | [037-remove-drifted-quality-thresholds](037-remove-drifted-quality-thresholds.md) | P2 | DONE | none |
| 2 | [038-report-export-in-analyze](038-report-export-in-analyze.md) | P2 | DONE | none |
| 3 | [039-progress-all-catalogue-metrics](039-progress-all-catalogue-metrics.md) | P3 | DONE | none |
| 4 | [040-fastapi-lifespan](040-fastapi-lifespan.md) | P3 | DONE | none |
| 5 | [036-upgrade-next-16](036-upgrade-next-16.md) | P1 | DONE | none (verification = full suite) |

Findings considered and rejected this round: "lint is just tsc" (not worth adding ESLint to
a strict-tsc static app); `docs/Background` duplication (~9.2 MB, zero runtime impact);
agent /docs + openapi public (localhost-only by design); media_tickets.used_at never set
(60 s TTL covers it); /metrics/series per-run parse (bounded, local scale). Direction
options still open (not planned): ShuttleSet ingestion helper and own-capture truth CLI
(Plan 028 phases 0/3 — data work, not code findings).

## UI/UX + motion polish (2026-08-21, plans 041-047)

Design-system + skills audit of commit `2a659f2` (better-ui, emil-design-eng,
apple-design, mobile-native-feel, improve-animations,
find-animation-opportunities). Execution order below; 046 depends on 043/044
selectors existing, 047 depends on 043 tokens.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 1 | [041-fix-theme-switch-smear](041-fix-theme-switch-smear.md) | P1 | DONE | none |
| 2 | [042-label-page-missing-styles](042-label-page-missing-styles.md) | P1 | DONE | none |
| 3 | [043-motion-tokens-and-hero-duration](043-motion-tokens-and-hero-duration.md) | P2 | DONE | none |
| 4 | [044-touch-pointer-hardening](044-touch-pointer-hardening.md) | P1 | DONE | none |
| 5 | [045-popover-entry-and-backdrop-crossfade](045-popover-entry-and-backdrop-crossfade.md) | P2 | DONE | 043 |
| 6 | [046-reduced-motion-refinement](046-reduced-motion-refinement.md) | P2 | DONE | 043, 044 |
| 7 | [047-analyze-results-reveal](047-analyze-results-reveal.md) | P3 | DONE | 043 |

Rejected this round: route-transition animations (core navigation),
trend-bar decorative motion (functional data), theme-icon crossfade
(frequent action), extra hover lifts (already sufficient), lab-list stagger
(near-correct already).

## UI polish round 2 (2026-08-21, plans 048-054)

Follow-up to plans 041-047. Seven low/medium findings from the design-system,
better-ui, apple-design, mobile-native-feel, and find-animation-opportunities
audit at commit `18b7980`. All independent; recommended order below.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 1 | [048-wire-error-notice](048-wire-error-notice.md) | P2 | DONE | none |
| 2 | [049-concentric-radius-and-touch-target](049-concentric-radius-and-touch-target.md) | P3 | DONE | none |
| 3 | [050-motion-token-reveal](050-motion-token-reveal.md) | P3 | DONE | none |
| 4 | [051-details-accordion-animation](051-details-accordion-animation.md) | P3 | DONE | none |
| 5 | [052-notice-entrance-fade](052-notice-entrance-fade.md) | P3 | DONE | none |
| 6 | [053-input-font-size-guard](053-input-font-size-guard.md) | P3 | DONE | none |
| 7 | [054-menu-exit-animation](054-menu-exit-animation.md) | P3 | DONE | none |

## UI polish round 3 (2026-08-22, plan 055)

Accessibility and interaction polish from the design-system audit at commit `0d9066d`.

| Order | Plan | Priority | Status | Depends on |
|------:|------|----------|--------|------------|
| 1 | [055-menu-close-escape-outside](055-menu-close-escape-outside.md) | P2 | MERGED (PR #19, main CI 32574135282 green) | none |

## Verification

```bash
npm run verify
# typecheck + web build + agent pytest/smoke + no-synthetic reports
npm run benchmark:fixtures   # requires live agent (pipeline smoke only since Plan 030)
```
