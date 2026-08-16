# Plan 028: Domain-readiness roadmap - from grilled decisions to zero locked modules

> **Executor instructions**: This is a decision/roadmap record produced from an
> approved grilling session (2026-08-16). It does NOT authorize implementation.
> Each phase below must be explicitly approved before execution. Preserve all
> verified gate scripts, the honest `complete=false` readiness state, and the
> "no fabricated evidence" rule. Never edit the seed manually.

## Status

- **Status**: PLANNED (decision record)
- **Priority**: P1 (roadmap; each phase separately gated)
- **Effort**: L (multi-phase, data-heavy)
- **Risk**: MEDIUM (data acquisition + gate extension)
- **Depends on**: plans/018-022 (provenance/manifest/release hardening), the
  verified gate set (`npm run verify`), docs/capture-protocols/side-ish-full-body-v1.md
- **Category**: roadmap | data | readiness
- **Planned at**: 2026-08-16 (post-grilling session Q1-Q27)

## Why this matters

Code, CI, and deployment are green (27/27 plans done, PR #10 merged,
bml.jenss.me routes verified), but all 24 modules remain `locked` because no
domain-valid (`badminton_stroke`) evidence exists. The only committed fixture is
`non_domain_smoke`, `validation/gold-datasets/` is empty, and `readiness.seed.json`
correctly reports `complete=false`. Public-ready (zero locked modules) is
blocked by data and evidence infrastructure - not by product code.

## Decisions locked by grilling (2026-08-16)

| Q | Decision |
|---|----------|
| Q1 | Sharpening goal = launch-readiness roadmap |
| Q2 | Target user = hobby Windows player |
| Q6 | Out of scope stays: Match Intelligence, multi-camera/3D, coach workspace |
| Q7 | Hybrid data: ShuttleSet (event/contact) + own capture (pose metrics) |
| Q8 | Two gates: Beta (<=1 month) then Public-ready |
| Q9 | Priority strokes: clear, smash, serve, forehand, backhand |
| Q10 | BYOK exposed but labeled "experimental" |
| Q11/Q20 | Beta users may contribute data opt-in; video never leaves the PC (report JSON + optional labels only) |
| Q12 | Beta <= 1 month; public-ready date open-ended (see Q18) |
| Q13 | New domain runner + manifest; smoke runner untouched |
| Q14 | Module unlock requires BOTH evidence kinds (event/contact AND pose metrics) |
| Q15 | ShuttleSet = only public dataset for gate evidence; Fine-Badminton = R&D only (non-commercial license) |
| Q16 | Evidence volume: 3 clips/module (beta), 5+ clips/module (public-ready) |
| Q17 | Forehand/backhand derived from ShuttleSet backhand flag + validated with own capture |
| Q18 | Public-ready v1 = zero locked (24 modules), no deadline |
| Q19 | Beta v1 = current verified state + BYOK label + opt-in + beta disclosure |
| Q21 | Ground truth via minimal web labeling mode (scrub -> contact frame + 4 corners -> truth) |
| Q22 | Beta evidence target = 11 priority modules (5 strokes x technique+layer + footwork:pure) @ 3 clips |
| Q23 | Beta success = >=5 users x >=1 real analysis + >=1 opt-in report |
| Q24 | Own-capture recorded by the maintainer (dogfooding) |
| Q25 | README gets staged roadmap + ShuttleSet attribution |
| Q26 | Domain media gitignored; manifest + SHA-256 + attribution committed |
| Q27 | This document is the deliverable; no implementation without explicit approval |

## Current state (verified 2026-08-16)

- `scripts/run-fixture-benchmarks.mjs`: single fixture, hardcoded path/hash,
  analyzes exactly 3 modules (`technique:clear`, `footwork:layer:clear`,
  `footwork:pure`); all other modules are written as locked reports.
- `scripts/check-readiness-integrity.mjs`: hardcodes the single fixture
  path/hash; validates seed <-> report <-> contract consistency; a `passed`
  report requires `fixtureKind === "badminton_stroke"`.
- `validation/benchmark-configs/default-gate.json`: contactFrameTolerance 3,
  minProposalConfidence 0.55, fixturePassRate 1, requiresRacket/Shuttle/Court true.
- Technique gate also requires racketTrackCoverage >= 0.8 and
  shuttleTrackCoverage >= 0.7; footwork requires courtValidRate == 1.
- Truth format: `validation/fixtures/person_1280x720_30fps.truth.json`
  (`fixtureKind`, `sha256`, `fps`, `contactFrameTruth`, `courtCorners`, `notes`).
- Web app has NO labeling surface yet (no `evidence|review|contactFrame|courtCorners|label`
  matches in `apps/web/src`); capture protocol doc exists at
  `docs/capture-protocols/side-ish-full-body-v1.md`.
- Git tree: `M apps/web/tsconfig.json` (user-owned, preserved), untracked
  `.playwright-mcp/` and `apps/web/test-results/` (test artifacts, ignored).

## Data strategy

### ShuttleSet (event/contact evidence)

- Facts: repository code is MIT; broadcast footage retains third-party rights
  (safe for private research, review before redistribution/commercial use);
  18 tactical classes (clear, smash, drop, drive, serve, net shot, ...); per
  stroke: hitting time/frame (30 fps), player/shuttle locations, backhand flag.
- Selection of matches, rally filtering, and clip counts per module is Phase 0
  fact-finding (not silently assumed).
- Fine-Badminton (non-commercial academic only) is excluded from gate evidence.

### Own capture (pose evidence)

- Protocol: docs/capture-protocols/side-ish-full-body-v1.md; ~15-20 clips;
  5 priority strokes (clear, smash, serve, forehand, backhand).

### Evidence rule

- A module unlocks only when BOTH pass: event/contact evidence (ShuttleSet
  clips) AND pose-metric evidence (own-capture clips).
- Volume: 3 clips/module for beta; 5+ for public-ready. One multi-stroke clip
  can contribute to several modules.
- Forehand/backhand: select clips via the ShuttleSet backhand flag; validate
  the mapping with 1-2 own-capture clips per side.

## Engineering work items (planned - NOT authorized yet)

1. `scripts/run-domain-benchmarks.mjs` + `validation/domain-manifest.json`
   (multi-fixture, per-module truth, per-clip court corners); smoke runner and
   its reports stay untouched.
2. Backward-compatible extension of `scripts/check-readiness-integrity.mjs`
   for multi-fixture manifest reports (single-fixture checks must keep passing).
3. Minimal web labeling mode: open capture -> scrub frames -> mark contact
   frame + 4 court corners -> save truth (reuses `/media` and
   `/metrics/series`; single-user).
4. README: staged roadmap (Beta v1 -> Public-ready v1) + ShuttleSet attribution.
5. Beta surface: BYOK "experimental" label, opt-in contribution flow
   (report-only upload, anonymized), beta disclosure.

## Domain manifest schema sketch (refined in Phase 1 with evidence)

```json
{
  "manifestVersion": 1,
  "clips": [
    {
      "id": "ss22-wd-2019-qf-r1-clear-001",
      "source": "shuttleset | own_capture",
      "path": "validation/domain-media/...",
      "sha256": "...",
      "fps": 30,
      "truth": {
        "strokeId": "clear",
        "hand": "forehand | backhand",
        "contactFrameTruth": 1234,
        "courtCorners": [{ "x": 0, "y": 0 }]
      }
    }
  ],
  "moduleEvidence": {
    "technique:clear": { "eventClips": ["..."], "poseClips": ["..."] }
  }
}
```

## Execution order (each phase explicitly approved and verified before the next)

| Phase | Work | Verify |
|------:|------|--------|
| 0 | ShuttleSet fact-finding: select matches/rallies, extract truth, list candidate clips | Candidate manifest + license notes committed |
| 1 | Domain runner + manifest + integrity extension | `npm run verify` green; `readiness:integrity` still honest; one domain report written |
| 2 | Web labeling mode | Typecheck + browser tests + one labeled clip end-to-end |
| 3 | Own-capture recording (5 strokes, ~15-20 clips) | Truth files + SHA-256 match media |
| 4 | Domain benchmark: 11 priority modules @ 3 clips | Reports written; seed honest; `readiness:integrity` green |
| 5 | Beta v1 ship (BYOK label, opt-in, disclosure) | `npm run verify` + browser smoke |
| 6 | Beta run: >=5 users x >=1 analysis + >=1 report | Counters + opt-in reports received |
| 7 | Public-ready v1: zero locked (24 modules) @ 5+ clips | `npm run readiness:check` passes; no deadline |

## Verification gates (all phases)

- Per phase: `npm run verify`, `npm run readiness:integrity`, targeted tests.
- Forbidden: manual seed edits, lowering gate values to force passes, synthetic
  baseline notes, claiming `non_domain_smoke` as stroke evidence.

## Risks and mitigations

- Broadcast pose quality (small player in frame) may fail pose gates on
  ShuttleSet clips -> evidence split: pose gates apply only to own-capture
  clips (Q14).
- ShuttleSet footage rights -> private use only; revisit at public-ready.
- Labeling effort is the largest build item -> minimal single-user scrub UI.
- Integrity checker hardcodes one fixture -> extend backward-compatibly with
  tests; never rewrite the verified path.
- Repo bloat from media -> `validation/domain-media/` gitignored; only
  manifest + hashes + attribution committed (Q26).
- Timeline drift -> public-ready is explicitly dateless (Q18).

## Open sub-decisions (resolved during phases with evidence, not silently)

- Exact ShuttleSet matches/rallies and clip counts per module (Phase 0).
- Report aggregation schema for multi-clip modules (Phase 1).
- Opt-in consent copy and anonymization fields (Phase 5).
- Whether contributed reports need user-visible attribution (Phase 6).

## Definition of done for this document

- All 27 grilled decisions recorded and internally consistent.
- Scope boundary explicit: this document authorizes nothing beyond itself.
- No source, test, or gate behavior was changed by producing this plan.

## Execution log

Updated 2026-08-16 after explicit user approval to implement all plans.

| Phase | Status | Evidence |
|------:|--------|----------|
| 0 ShuttleSet fact-finding (select matches/rallies, extract truth) | NOT_RUN | Requires downloading the dataset and local media storage; media is gitignored by design (Q26). Re-run when clips are available. |
| 1 Domain runner + manifest + integrity extension | DONE | scripts/run-domain-benchmarks.mjs, validation/domain-manifest.json + schema, check-readiness-integrity.mjs domain branch, CI smoke step |
| 2 Web labeling mode | DONE | apps/web/src/app/label/page.tsx + lib/labeling.ts + labeling.spec.ts |
| 3 Own-capture recording (5 strokes, ~15-20 clips) | NOT_RUN | Physical recording by the maintainer (Q24); cannot be executed by an agent |
| 4 Domain benchmark: 11 priority modules @ 3 clips | NOT_RUN | Requires Phase 0 clips + Phase 3 captures |
| 5 Beta v1 ship (BYOK label, opt-in, disclosure) | DONE (code) | /contribute page, home beta notice, Experimental badge on BYOK, beta.spec.ts |
| 6 Beta run: >=5 users x >=1 analysis + >=1 report | NOT_RUN | Requires real beta users (Q23) |
| 7 Public-ready v1: zero locked (24 modules) @ 5+ clips | NOT_RUN | Requires Phases 0, 3, 4, 6 |

Gate verification for the completed code phases: full repository verify suite,
browser tests, readiness integrity, and the empty-manifest domain smoke step -
all green before merge. Implementation history: branch jenss/domain-readiness,
PR #11 merged as b56fa769b1c70e13fa610507f9aeeb3446e33bb7 (2026-08-16). Review
findings (evidence slot validation, clip dedupe, full-manifest provenance
digest, CI media guard + integrity ordering, smoke-fixture completion rule)
were addressed in a9ea321 and 8dba406 and all threads resolved before merge.
