# Plan 036: Upgrade Next.js 15 → 16 to clear high-severity advisories

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0046446..HEAD -- apps/web/package.json apps/web/package-lock.json apps/web/next.config.mjs`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security | migration
- **Planned at**: commit `0046446`, 2026-08-17

## Why this matters

`npm audit --audit-level=high` reports **4 high-severity advisories** with no
patch path on Next 15: PostCSS arbitrary file read via attacker-controlled
`sourceMappingURL` (GHSA-6g55-p6wh-862q, GHSA-fxqj-rqcc-2cmp, GHSA-r28c-9q8g-f849)
and sharp <0.35 inherited libvips CVEs (CVE-2026-33327/28/35590/91). The only
fix is `next@16.3.1` (breaking major). Practical exposure is low (static export
on Cloudflare Pages, no image-optimization server, CSS is build-time only), but
staying behind means accepting high-severity advisories indefinitely.

## Current state

- `apps/web/package.json` — `"next": "^15.2.4"`, installed `next@15.5.21`
  (verified with `npm ls next postcss sharp`).
- `npm ls`: next@15.5.21 bundles `postcss@8.4.31` (vulnerable) and
  `sharp@0.34.5` (vulnerable). Top-level `postcss@8.5.23` is patched.
- `apps/web/next.config.mjs` — uses `distDir` override for dev
  (`NEXT_DIST_DIR ?? ".next-dev"`), `output: "export"` for production,
  `transpilePackages: ["@bml/contracts"]`. All three remain supported in Next 16.
- The app has **no dynamic routes with `params`/`searchParams`** (all pages are
  static client components + one static server layout) — the Next 16 async
  params change does not apply here.
- React is already `19.2.8`; `typescript@5.9.3`; Node 20+ (CI preflight enforces).

## Commands you will need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Bump dep  | `npm.cmd install next@^16.3.1 -w @bml/web` (network; escalate) | exit 0 |
| Audit     | `npm.cmd audit --audit-level=high` | "found 0 vulnerabilities" |
| Typecheck | `npm.cmd run test -w @bml/web` | exit 0, no errors |
| Build     | `npm.cmd run build -w @bml/web` | exit 0; `apps/web/out` produced |
| Full gate | `npm.cmd run verify` (after all plans) | all steps exit 0 |

Set `NODE_OPTIONS=--max-old-space-size=2048` for every npm/node invocation.

## Scope

**In scope**: `apps/web/package.json`, root `package-lock.json` (npm workspaces
writes it there).

**Out of scope**: `apps/web/next.config.mjs` (only change it if the build
fails; report instead of improvising), any other workspace.

## Steps

### Step 1: Bump Next to 16.3.x

Run `npm.cmd install next@^16.3.1 -w @bml/web` (escalate for network). If npm
reports peer conflicts, update `react`/`react-dom` only if npm explicitly asks.

**Verify**: `npm ls next` → `next@16.3.x`; `npm audit --audit-level=high` → `found 0 vulnerabilities`.

### Step 2: Typecheck

**Verify**: `npm.cmd run test -w @bml/web` → exit 0.

### Step 3: Production build (static export)

**Verify**: `npm.cmd run build -w @bml/web` → exit 0, `apps/web/out/index.html` exists.

### Step 4: Dev-mode smoke (`dev:test` path used by the browser suite)

Run `npm.cmd run dev:test -w @bml/web` for ~10s and confirm it boots on 3101,
then stop it. (Full browser suite runs in the repository verify step.)

**Verify**: server logs show "Ready" on port 3101; process stops cleanly.

## Test plan

- No new unit tests — the existing gates are the test: contracts + web
  typecheck, static-export build, 23 agent pytest, and the 15-test Playwright
  suite (`ui.spec.ts`, `beta.spec.ts`, `labeling.spec.ts`) run against the
  static export in CI.
- `npm run verify` must stay green end-to-end (run once after all plans land).

## Done criteria

- [ ] `npm ls next` shows 16.3.x and `npm audit --audit-level=high` reports 0 vulnerabilities
- [ ] `npm run verify` exits 0 (full suite)
- [ ] No files outside `apps/web/package.json` and lockfiles are modified by this plan
- [ ] `plans/README.md` status row updated

## STOP conditions

- The Next 16 build fails in a way that requires changing `next.config.mjs`
  beyond documented compat (e.g. Turbopack/export incompatibility) → stop and
  report with the exact error.
- A browser test fails only after this upgrade and is not explained by plans
  037–040 → stop and report rather than disabling tests.
- `npm audit` still shows high advisories after the upgrade → stop and report.

## Maintenance notes

- The CI browser gate uses `scripts/serve-export.mjs` against `apps/web/out`;
  if Next 16 changes the export layout (chunk hashing/filenames), that server
  needs no changes — it serves by path with SPA fallback.
- Future Next majors: re-run `npm audit` and the browser suite; the static-export
  shape is the compatibility surface to watch.
