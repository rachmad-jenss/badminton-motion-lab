# Plan 059: Make pure footwork independent and frame-accurate

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/agent/main.py apps/agent/adapters/events.py apps/agent/adapters/metrics_engine.py apps/agent/adapters/frame_index.py apps/agent/pipeline/footwork_pure.py apps/agent/test_security.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/058-analysis-resource-safety.md
- **Category**: bug
- **Planned at**: commit `d6066d2`, 2026-08-27

## Why this matters

The UI offers a footwork-only mode, but the metrics engine returns no metrics without a contact event and the pure-footwork module has only a contract file. This makes a drill without racket/shuttle evidence look like a successful analysis with empty output. Manual events also can target source frames not present in a sampled pose window; the current nearest-frame fallback can measure the wrong pose. This plan creates a real pose-trajectory path for pure footwork and withholds measurements when exact evidence is unavailable.

## Current state

- `apps/agent/main.py:638-656` determines modules after event proposal, so event proposal has no pure-mode signal.
- `apps/agent/adapters/events.py:41-120` derives contact confidence from racket/shuttle tracks and returns `manual_required` when those tracks are empty.
- `apps/agent/adapters/metrics_engine.py:44-53` returns before any metric when `contact` is absent.
- `apps/agent/pipeline/footwork_pure.py:5-13` lists pure metric IDs but contains no computation.
- `apps/agent/adapters/frame_index.py:12-22` returns the nearest pose frame; `metrics_engine.py:55-57` uses it for contact evidence.
- `apps/agent/test_security.py:203-224` currently proves that a manual event can refer to an unsampled source frame, but does not prove measurement safety.

Use the existing normalized pose landmarks, event schema, court homography, and `withheld` metric convention. Do not synthesize contact or shuttle events for pure footwork.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused tests | `apps/agent/.venv/Scripts/python.exe -m pytest apps/agent/test_security.py -q` | new pure/frame tests pass |
| Agent suite | `npm.cmd run test:agent` | all tests pass |
| Typecheck/contracts | `npm.cmd run typecheck` | exit 0 |

## Scope

**In scope**:

- `apps/agent/main.py`
- `apps/agent/adapters/events.py`
- `apps/agent/adapters/metrics_engine.py`
- `apps/agent/adapters/frame_index.py`
- `apps/agent/pipeline/footwork_pure.py`
- `apps/agent/test_security.py`

**Out of scope**:

- Unlocking readiness modules without real domain evidence.
- Changing technique-stroke metrics when a contact event is present.
- Inventing shuttle/racket tracks for drill footage.

## Git workflow

- Branch `jenss/improve-all-findings`.
- Atomic commit: `feat(agent): calculate standalone pure footwork metrics`.

## Steps

### Step 1: Add failing pure-footwork and exact-frame tests

Add a deterministic pose-only fixture with both ankles moving across several frames and a valid manual court homography. Assert `propose_events(..., pure_footwork=True)` returns split/first-step/base events without a contact event, and `compute_metrics(modules=["footwork:pure"], ...)` returns pure metric IDs. Add a test where a corrected contact frame is absent from sampled pose frames and assert the contact-dependent output is withheld/empty rather than using a neighboring frame.

**Verify**: focused tests fail because `propose_events` has no pure mode, metrics return early without contact, and `get_frame` selects nearest data.

### Step 2: Add pure event proposal from pose trajectory

Move module selection before event proposal in `_run_analyze_sync` and pass `pure_footwork=True` when requested. Extend `propose_events` with a pure path that derives ankle-midpoint displacement from real pose frames. If movement or required landmarks are insufficient, return `manual_required`; if movement is sufficient, emit bounded model-confidence `split_step`, `first_step`, `base_return`, `rep_start`, and `rep_end` events without a fabricated contact. Preserve manual event validation and correction precedence.

**Verify**: the pure-event tests pass and existing racket/contact tests remain green.

### Step 3: Compute pure metrics without contact

Add a pure-only metric branch in `metrics_engine.py` for `split_step_count`, `first_step_latency`, `court_coverage_area`, and `path_efficiency`. Anchor evidence to split/first/base or the first available pose frame, mark court-dependent values withheld when calibration is invalid, and retain the existing module IDs/units. Keep the current contact-gated branch for technique and footwork-layer metrics.

**Verify**: focused tests assert non-empty pure metrics for the pose-only fixture and withheld court metrics for invalid calibration.

### Step 4: Stop nearest-frame misuse for corrected contact evidence

Expose an exact-frame lookup or an `allow_nearest` parameter in `frame_index.py`. For manual/corrected contact events, require an exact sampled pose frame; return withheld output with a clear limitation if it is unavailable. Keep nearest lookup only for model-generated interpolation paths that already use it intentionally. Add the limitation to the test assertion.

**Verify**: the unsampled manual-frame regression passes and existing sampled contact metrics still pass.

### Step 5: Commit the pure-footwork unit

Update `plans/README.md`, run `git diff --check`, and commit only scoped files.

**Verify**: `npm.cmd run test:agent` and `npm.cmd run typecheck` exit 0; commit stat contains only this plan's files.

## Test plan

- Pose-only drill with no racket/shuttle/contact still produces pure metrics.
- Insufficient pose or invalid court produces explicit `manual_required`/withheld output.
- Existing model/manual contact correction remains unchanged.
- Unsampled corrected contact never uses a neighboring frame silently.

## Done criteria

- [ ] Pure mode has an executable event and metric path independent of contact.
- [ ] No synthetic contact/racket/shuttle evidence is created.
- [ ] Corrected contact measurements require exact sampled pose evidence.
- [ ] Full agent tests and typecheck pass.

## STOP conditions

- The contract requires a contact frame for pure metrics after all current schema/catalogue sources are rechecked.
- Pose coordinate units differ from the normalized values assumed here.
- A change would alter technique metrics without a separate characterization test.

## Maintenance notes

Pure-footwork calibration and event thresholds should be benchmarked with real drill clips before readiness unlock. The source-frame/decoded-frame distinction must remain explicit whenever stride or memory caps change.
