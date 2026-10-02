# Plan 061: Make fresh setup and production serving reproducible

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/web/package.json package.json package-lock.json apps/agent/requirements.txt apps/agent/requirements.lock.txt infra/windows/install-agent.ps1 .github/workflows/ci.yml README.md`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/058-analysis-resource-safety.md
- **Category**: migration
- **Planned at**: commit `d6066d2`, 2026-08-27
- **Implementation status**: DONE on branch `jenss/improve-all-findings`

## Why this matters

The web is configured as a Next static export but its workspace `start` script still calls `next start`, which cannot serve that output. Node engine metadata disagrees between the manifest and lockfile, and several Python runtime dependencies float to whatever PyPI serves on the day of installation. A first-time Windows user can therefore build successfully and still fail to run or reproduce the same agent runtime.

## Current state

- `apps/web/next.config.mjs:7-10` enables `output: "export"` for production.
- `apps/web/package.json:9` uses `"start": "next start"`; `scripts/serve-export.mjs` is already the known static-export server used by CI.
- `package.json:22-24` requires Node `>=20.9.0`; `package-lock.json:14-16` records only `>=20`.
- `apps/agent/requirements.txt:5,9-13` leaves NumPy, OpenCV, MediaPipe, cryptography, and pytest unbounded.
- `infra/windows/install-agent.ps1:82-86` installs directly from `requirements.txt`; CI installs the same floating set.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Lock consistency | `npm.cmd ci` | exit 0 |
| Typecheck/build | `npm.cmd run typecheck; npm.cmd run build -w @bml/web` | both exit 0 |
| Python dependency check | `apps/agent/.venv/Scripts/python.exe -m pip check` | no broken requirements |
| Agent suite | `npm.cmd run test:agent` | all tests pass |
| Static server smoke | `npm.cmd run build -w @bml/web; $env:PORT='3199'; node scripts/serve-export.mjs` plus HTTP checks | `/`, `/agent`, `/analyze` return 200 |

## Scope

**In scope**:

- `apps/web/package.json`
- root `package.json`
- `package-lock.json`
- `apps/agent/requirements.txt`
- `apps/agent/requirements.lock.txt` (create)
- `infra/windows/install-agent.ps1`
- `.github/workflows/ci.yml`
- `README.md`
- `.env.example`
- `scripts/test-runtime-contract.mjs`
- `plans/README.md`

**Out of scope**:

- Major framework upgrades.
- Dependency vulnerability claims; run `npm audit`/`pip-audit` only when the network/authorization permits it and report unavailable results honestly.
- Changing the static server's local-only bind.

## Git workflow

- Branch `jenss/improve-all-findings`.
- Atomic commit: `chore: make setup and static serving reproducible`.

## Steps

### Step 1: Add reproducibility checks before edits

Add a small repository test or shell-verifiable assertion that the web `start` script points to the export server, the root engine floor matches the lockfile, and the installer/CI use the same Python lock file. Add a documentation smoke expectation for `npm run build` followed by `npm run serve:web`.

**Verify**: the new checks fail against the current `next start`, lock drift, and floating-install configuration.

### Step 2: Wire the static-export serve command

Change `apps/web/package.json` `start` to invoke `node ../../scripts/serve-export.mjs`, add a root `serve:web` script that delegates to the workspace, and document the build/serve URLs in `README.md`. Keep `dev:web` on port 3001 and the static server default on port 3101; do not reuse a listener blindly during tests.

**Verify**: build the export, start it on a fresh port, and assert `/`, `/agent`, and `/analyze` return HTTP 200 with the expected HTML shell.

### Step 3: Align Node metadata and lock Python runtime

Update the lockfile root engine to `>=20.9.0`. Create `apps/agent/requirements.lock.txt` with exact versions for the direct and transitive packages resolved by the supported Windows Python version; keep the human-readable requirements file as the direct dependency list with the same compatible floors. Change the installer and CI to install the lock file, then run `pip check` and the agent suite. Do not include secrets or machine-specific paths in the lock file.

**Verify**: `npm.cmd ci`, `pip check`, and `npm.cmd run test:agent` pass in the supported environment; inspect the diff for accidental platform-local packages.

### Step 4: Commit the release/DX unit

Update `plans/README.md`, run `git diff --check`, and commit only scoped files.

**Verify**: `git show --stat --oneline HEAD` lists only this plan's paths and the static-server smoke has fresh HTTP evidence.

## Test plan

- Fresh Node install obeys the 20.9 floor.
- Static export is served by the documented command.
- Installer and CI use the same exact Python lock.
- Agent tests/typecheck/build remain green.

## Done criteria

- [ ] `npm run build` followed by `npm run serve:web` serves the built app.
- [ ] Node engine metadata is identical in manifest and lockfile.
- [ ] Windows installer and CI install the same pinned Python environment.
- [ ] README documents the correct production/local-beta path.

## STOP conditions

- A pinned package has no wheel for the supported Python/Windows matrix.
- The current virtual environment was generated from a different Python major version and cannot establish a valid lock.
- Static server smoke reaches a different process/port identity than this repository's export.

## Maintenance notes

Refresh the Python lock only as an explicit dependency change, then rerun the Windows agent suite and CI. Keep the static-export server contract aligned with `apps/web/playwright.config.ts` and `wrangler.toml`.
