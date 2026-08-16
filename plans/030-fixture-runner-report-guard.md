# Plan 30: Stop the fixture runner from overwriting domain evidence reports/seed

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. Update the status row in
> `plans/README.md` when done (unless a reviewer maintains the index).
>
> **Drift check (run first)**: `git diff --stat aa1479a..HEAD -- <in-scope paths>`
> If in-scope files changed since this plan was written, compare excerpts against
> live code; on mismatch, STOP.

## Status

- **Priority**: P1 | P2
- **Effort**: S | M
- **Risk**: LOW
- **Depends on**: see body
- **Category**: see body
- **Planned at**: commit `aa1479a`, 2026-08-16

## Why this matters

`run-fixture-benchmarks.mjs` (wired to `npm run benchmark:fixtures`, still cited in the
README quick-start) writes all 25 `validation/reports/*.json` and
`apps/web/src/lib/readiness.seed.json` with smoke-only provenance — the exact files
`run-domain-benchmarks.mjs` writes with domain evidence blocks. Running the fixture
runner after a domain benchmark silently destroys the domain evidence and resets the
seed source — a data-loss footgun for the Plan 028 roadmap.

## Current state

- `scripts/run-fixture-benchmarks.mjs` main() writes reports + seed unconditionally
  (module loop ~lines 230-320, seed ~lines 300-318).
- `scripts/run-domain-benchmarks.mjs` writes the same paths with evidence blocks.
- `README.md` quick-start step 3: "npm run benchmark:fixtures / npm run readiness:check …
  This writes validation/reports/*.json and updates … readiness.seed.json".
- `package.json` scripts: `benchmark:fixtures` and `test:domain` both exist; CI runs both.

## Scope

**In scope**: `scripts/run-fixture-benchmarks.mjs`, `README.md`.
**Out of scope**: `scripts/run-domain-benchmarks.mjs`, CI workflow, seed/report contents.

## Steps

1. In `run-fixture-benchmarks.mjs` near the top of `main()` (after the analyze call completes
   successfully), add a guard so report/seed writes only happen when explicitly enabled:
   ```js
   const writeReports = process.env.BML_FIXTURE_WRITE_REPORTS === "1";
   ```
   Wrap the "write reports for all modules" loop and the seed-write block in
   `if (writeReports) { ... }`, and in the else branch log:
   ```js
   console.log("Fixture pipeline smoke OK. Reports and readiness seed are owned by run-domain-benchmarks.mjs (Plan 028); set BML_FIXTURE_WRITE_REPORTS=1 to restore legacy report writes.");
   ```
   Keep the analyze itself (real pipeline smoke) and the "forbidden synthetic notes"
   scan (read-only) unchanged.
2. Update `README.md` quick-start step 3 to point maintainers at the domain runner:
   ```md
   ### 3. Unlock modules via domain fixture benchmarks (maintainer only)

   ```bash
   npm run test:domain          # real agent + validation/domain-media clips (Plan 028)
   npm run readiness:check      # strict public gate: zero locked modules
   ```

   `npm run benchmark:fixtures` is a pipeline smoke check only (no report writes since
   Plan 030); `npm run readiness:integrity` validates report/seed provenance.
   ```

## Test plan

- `node --check scripts/run-fixture-benchmarks.mjs` exits 0.
- `node scripts/check-readiness-integrity.mjs` still exits 0 (committed reports untouched).
- `node scripts/check-no-synthetic-reports.mjs` still exits 0.

## Done criteria

- [ ] `node --check scripts/run-fixture-benchmarks.mjs` exits 0
- [ ] README quick-start step 3 no longer instructs `benchmark:fixtures` as the evidence writer
- [ ] `git status --short` shows only `scripts/run-fixture-benchmarks.mjs` and `README.md` modified

## STOP conditions

- If `run-domain-benchmarks.mjs` is found to depend on fixture-runner-written files (it does not; it writes its own).

## Maintenance notes

- If the fixture runner ever needs to write evidence again, prefer routing through the domain runner.
- CI order (benchmark:fixtures smoke → test:domain --ci-smoke → readiness:integrity) stays valid.
