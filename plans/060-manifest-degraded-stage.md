# Plan 060: Report degraded pipeline stages honestly

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/agent/main.py apps/agent/pipeline/package.py packages/contracts/src/schemas/analysis-manifest.schema.json apps/agent/test_security.py`

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: MED
- **Depends on**: plans/058-analysis-resource-safety.md
- **Category**: bug
- **Planned at**: commit `d6066d2`, 2026-08-27
- **Implementation status**: DONE on branch `jenss/improve-all-findings`

## Why this matters

The shuttle detector catches `MediaError` and continues with an empty/error result so the rest of the analysis can be reviewed. The manifest writer nevertheless marks the shuttle step `ok`. That contradicts the package's provenance contract and prevents downstream tooling from distinguishing a complete detector run from a degraded one.

## Current state

- `apps/agent/main.py:605-621` returns a shuttle object containing `error` after a detector failure.
- `apps/agent/pipeline/package.py:102-109` always writes the shuttle step with status `ok`.
- `packages/contracts/src/schemas/analysis-manifest.schema.json:53` accepts any status string and does not describe the optional error field.
- `packages/contracts/src/schemas/analysis.ts` already defines `status` as `ok | skipped | failed` and `error?: string`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Agent tests | `npm.cmd run test:agent` | all tests pass |
| Contract/typecheck | `npm.cmd run typecheck` | exit 0 |
| Manifest validation | `apps/agent/.venv/Scripts/python.exe -m pytest apps/agent/test_security.py -q` | manifest assertions pass |

## Scope

**In scope**:

- `apps/agent/main.py`
- `apps/agent/pipeline/package.py`
- `packages/contracts/src/schemas/analysis-manifest.schema.json`
- `apps/agent/test_security.py`

**Out of scope**:

- Turning a degraded shuttle stage into a hard analysis failure; the existing review workflow intentionally continues.
- Changing the public module readiness gate.

## Git workflow

- Branch `jenss/improve-all-findings`.
- Atomic commit: `fix(agent): mark degraded pipeline stages in manifests`.

## Steps

### Step 1: Add failing manifest tests

Extend the package writer test with a shuttle artifact containing an `error` and assert its manifest step is `failed` with the same non-secret error message. Assert a normal shuttle artifact remains `ok`, and schema validation rejects a status outside `ok`, `skipped`, or `failed`.

**Verify**: focused tests fail because the writer currently hardcodes `ok` and the schema accepts arbitrary status values.

### Step 2: Pass status/error through the package writer

Update the local `step` helper in `package.py` to accept an optional error and emit it only when present. Set the shuttle status to `failed` when `shuttle.get("error")` is truthy; leave other degraded-but-intentional statuses explicit. Add the schema enum and optional string error property. Keep TypeScript and Python vocabulary identical.

**Verify**: focused tests pass, then run `npm.cmd run test:agent` and `npm.cmd run typecheck`.

### Step 3: Commit the provenance unit

Update `plans/README.md`, run `git diff --check`, and commit only scoped files.

**Verify**: commit stat and manifest tests show only this plan's changes.

## Test plan

- Failed shuttle detection produces a failed step with an error.
- Normal shuttle detection remains `ok`.
- Invalid step status fails schema validation.
- Existing package lifecycle cleanup stays green.

## Done criteria

- [ ] Manifest truthfully distinguishes shuttle failure from success.
- [ ] Schema and TypeScript contract agree on allowed statuses/errors.
- [ ] Agent suite and typecheck pass.

## STOP conditions

- The runtime package schema is not the checked-in contract schema.
- Existing consumers require failed stages to be omitted rather than represented.

## Maintenance notes

Any future non-fatal detector must choose `ok`, `skipped`, or `failed` deliberately and include a bounded error message for `failed`; do not encode failure only in an artifact body.
