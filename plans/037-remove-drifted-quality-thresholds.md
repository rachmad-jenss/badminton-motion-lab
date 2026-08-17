# Plan 037: Remove dead, drifted CAPTURE_QUALITY_THRESHOLDS and correct gate docs

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0046446..HEAD -- packages/contracts/src/index.ts docs/capture-protocols apps/web/src/app/capture-guide`

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt | docs
- **Planned at**: commit `0046446`, 2026-08-17

## Why this matters

`packages/contracts/src/index.ts` exports `CAPTURE_QUALITY_THRESHOLDS` that
nothing imports (verified by grep over `apps/web/src`, `apps/agent`, `scripts`,
`packages/contracts/src`). It claims `minBodyVisibilityRatio: 0.85` and
`allowedYawDeg: 35`, while the real gate (`apps/agent/adapters/quality.py`,
`THRESHOLDS`) enforces `minBodyVisibilityRatio: 0.5` and performs **no yaw
measurement at all**. The capture protocol and the web Capture Guide repeat the
"±35° yaw" claim as a gate requirement. A maintainer or agent reading the
contracts/docs believes the gate is stricter than it is — a drift trap.

## Current state

- `packages/contracts/src/index.ts:7-17`:
  ```ts
  export const CAPTURE_QUALITY_THRESHOLDS = {
    minWidth: 1280, minHeight: 720, minFps: 30,
    minBrightness: 40, maxBrightness: 220,
    minBodyVisibilityRatio: 0.85,
    allowedYawDeg: 35,
    profileId: "side_ish_full_body_v1",
  } as const;
  ```
- `apps/agent/adapters/quality.py:6-15` — actual gate: `minBodyVisibilityRatio: 0.5`,
  no yaw check, brightness 40–220, min 1280×720@30.
- `docs/capture-protocols/side-ish-full-body-v1.md:5` — "Camera roughly side-on (yaw within ±35°)".
- `apps/web/src/app/capture-guide/page.tsx` (Technical requirements `<details>`) —
  "Side angle within roughly 35 degrees of a true side view."

## Scope

**In scope**:
- `packages/contracts/src/index.ts` (delete the dead export)
- `docs/capture-protocols/side-ish-full-body-v1.md` (honest wording)
- `apps/web/src/app/capture-guide/page.tsx` (honest wording)

**Out of scope**: the agent gate itself (`quality.py`) — changing the actual
thresholds would alter product behavior and needs domain evidence first.

## Steps

### Step 1: Delete the dead export

Remove the `CAPTURE_QUALITY_THRESHOLDS` block from
`packages/contracts/src/index.ts` (keep all `export *` lines).

**Verify**: recursive grep for `CAPTURE_QUALITY_THRESHOLDS` across
`apps/web/src`, `apps/agent`, `scripts`, `packages/contracts/src` → no matches.

### Step 2: Correct the capture protocol

In `docs/capture-protocols/side-ish-full-body-v1.md`, change the yaw bullet to
state it is **recommended guidance, not currently gate-enforced**, and add one
line noting the enforced checks are: min 1280×720, min 30 fps, mean luma
40–220, mean edge ratio ≥ 0.002, and full-body landmark presence on ≥50% of frames. Keep the
"Failed checks → analysis rejected before perception" line accurate (it refers
to the enforced checks).

**Verify**: file contains no standalone "yaw within ±35°" gate claim; the
enforced-threshold line matches `quality.py` values.

### Step 3: Correct the web Capture Guide

In `apps/web/src/app/capture-guide/page.tsx` Technical requirements list,
reword the yaw bullet to "Side angle: aim for roughly a true side view
(recommended, not automatically checked)". Keep resolution/fps/lighting
bullets unchanged (those are enforced).

**Verify**: `npm.cmd run test -w @bml/web` → exit 0.

## Test plan

- Grep-based: no references to the removed constant anywhere (step 1 verify).
- Existing browser tests must still pass (the Capture Guide copy change is
  text-only; confirm no test asserts the old yaw wording — grep `yaw|35 degrees`
  in `apps/web/tests` returns nothing).

## Done criteria

- [ ] No `CAPTURE_QUALITY_THRESHOLDS` references anywhere in source
- [ ] Capture protocol and Capture Guide no longer claim an enforced yaw gate
- [ ] `npm run test -w @bml/web` and `npm run test -w @bml/contracts` exit 0
- [ ] `plans/README.md` status row updated

## STOP conditions

- Any consumer of the constant is found after the first grep (the executor's
  grep differs from the advisor's) → stop and report.
- `readiness:integrity` or `check-no-synthetic-reports` break — they must not;
  they do not reference this constant.

## Maintenance notes

- The single source of truth for capture-gate thresholds is
  `apps/agent/adapters/quality.py`. If a future plan adds yaw estimation,
  update the protocol doc and this page in the same change.
