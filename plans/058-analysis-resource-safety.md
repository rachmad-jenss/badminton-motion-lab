# Plan 058: Bound analysis memory and keep media work off the event loop

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/agent/main.py apps/agent/adapters/media.py apps/agent/test_security.py scripts/run-domain-benchmarks.mjs scripts/run-fixture-benchmarks.mjs scripts/check-readiness-integrity.mjs`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: perf
- **Planned at**: commit `d6066d2`, 2026-08-27
- **Implementation status**: DONE on branch `jenss/improve-all-findings`
- **Verification follow-up**: provenance compatibility correction committed separately after the first full-suite run.

## Why this matters

Media registration and analysis currently run synchronous ffprobe and SHA-256 work from async endpoints, and analysis repeats both operations before entering the worker. Large files can block health/UI requests and do work outside the analysis semaphore. The decoded frame list is also allowed to approach roughly 830 MB at the current 720p default. This plan performs one bounded preflight, moves it into the worker boundary, and applies a conservative byte cap without inventing or dropping provenance silently.

## Current state

- `apps/agent/main.py:346-370,373-427` calls synchronous `probe_media` and `fingerprint_file` from async registration/import handlers.
- `apps/agent/main.py:748-761` repeats both operations before `asyncio.to_thread`, so the expensive preflight is outside the semaphore.
- `apps/agent/main.py:56-60` documents the current pixel cap as about 830 MB at 720p.
- `apps/agent/adapters/media.py:146-153` materializes the complete decoded frame window with `list(iter_frames(...))`.
- `scripts/run-domain-benchmarks.mjs:163`, `scripts/run-fixture-benchmarks.mjs:120`, and `scripts/check-readiness-integrity.mjs:79` hash full video files with `readFileSync`.

The agent already uses chunked hashing in `apps/agent/adapters/media.py:27-35`, `asyncio.to_thread`, and a single `ANALYSIS_SEMAPHORE`; extend those patterns rather than introducing a queue or speculative cache.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Focused agent tests | `apps/agent/.venv/Scripts/python.exe -m pytest apps/agent/test_security.py -q` | resource/provenance tests pass |
| Agent suite | `npm.cmd run test:agent` | all tests pass |
| Script syntax | `node --check scripts/stream-sha256.mjs` | exit 0 |
| Typecheck | `npm.cmd run typecheck` | exit 0 |

## Scope

**In scope**:

- `apps/agent/main.py`
- `apps/agent/adapters/media.py`
- `apps/agent/test_security.py`
- `apps/agent/test_integrity.py`
- `scripts/stream-sha256.mjs` (create)
- `scripts/test-stream-sha256.mjs` (create)
- `scripts/run-domain-benchmarks.mjs`
- `scripts/run-fixture-benchmarks.mjs`
- `scripts/check-readiness-integrity.mjs`
- `package.json`

**Out of scope**:

- Removing the bounded frame-list architecture entirely; that requires a separate batch/streaming design.
- Increasing the capture upload limit.
- Parallelizing benchmark clips; serial execution is required for memory safety.

## Git workflow

- Branch `jenss/improve-all-findings`.
- Atomic commit: `perf(agent): bound media preflight and analysis memory`.

## Steps

### Step 1: Add failing call-count, responsiveness, and window-cap tests

Add agent tests that monkeypatch the media inspection boundary and assert registration performs it through the async worker path, while analysis performs exactly one fresh preflight before the decode worker. Extend `resolve_frame_window` assertions for the new byte budget, including 720p, 4K, and a one-frame-over-budget case. Add a small Node testable helper import path or script-level assertion for streaming hash behavior without loading the whole file.

**Verify**: focused tests fail because the current code calls the two functions directly and the default frame cap remains the old pixel-only value.

### Step 2: Create one synchronous inspection boundary and offload it

Add `_inspect_capture_sync(path)` returning `(fingerprint, metadata)` and invoke it with `await asyncio.to_thread(...)` from registration/import. In `/analyze`, move fresh inspection inside `ANALYSIS_SEMAPHORE`, compare it with stored provenance, and pass the already-validated fingerprint/metadata into `_run_analyze_sync`. Remove the second hash/probe from `_run_analyze_sync`; keep structured `MediaError` and 409 mapping intact.

**Verify**: focused agent tests pass and the agent suite remains green.

### Step 3: Apply a conservative decoded-frame byte budget

Add `BML_MAX_ANALYSIS_BYTES` with a default no greater than 384 MiB. Update `resolve_frame_window` to clamp frames by `width * height * 3` in addition to the existing cap, expose the effective byte budget in the summary, and keep automatic stride coverage across the full source video. If one raw frame itself exceeds the budget, keep one-frame behavior so the quality gate can return a deterministic result rather than dividing by zero. Do not use `readFileSync` for media data.

**Verify**: run the window tests, `npm.cmd run test:agent`, and inspect an analysis summary fixture to confirm `frameWindow` reports the cap and stride.

### Step 4: Stream script-side hashes

Create `scripts/stream-sha256.mjs` using `createReadStream` and async iteration. Replace the three benchmark/readiness `readFileSync(video)` hashes with `await sha256File(...)`; preserve canonical manifest digest hashing of small JSON strings. Keep benchmark clip processing serial.

**Verify**: `node --check` on every changed script and a temporary small-file hash comparison against `sha256sum`/Node crypto returns the same uppercase digest.

### Step 5: Commit the resource-safety unit

Update `plans/README.md`, run `git diff --check`, and commit only scoped files.

**Verify**: `git show --stat --oneline HEAD` lists only this plan's files and all focused tests are green.

## Test plan

- Exact preflight call count and semaphore placement.
- Frame-window byte caps at 720p, 4K, and huge dimensions.
- Existing provenance mismatch and quality-gate behavior.
- Script hash equality without whole-file reads.
- Full agent suite plus typecheck.

## Done criteria

- [ ] No synchronous ffprobe/hash work runs directly in async endpoints.
- [ ] Analyze preflight is inside the semaphore and is not repeated by the worker.
- [ ] Default decoded-frame budget is at most 384 MiB before model overhead.
- [ ] Benchmark/readiness video hashes stream from disk.
- [ ] Existing lifecycle/provenance tests pass.

## STOP conditions

- A test requires concurrent analysis or parallel benchmark clips to pass.
- The measured frame representation differs from 3-byte BGR arrays; stop and recalculate instead of claiming the byte bound.
- Removing the second preflight would invalidate an existing provenance contract that cannot be covered by a pre-decode check.

## Maintenance notes

Future pipeline stages should accept the validated metadata/fingerprint rather than reopening the source. If peak memory remains high after this cap, the next change should be batch pose/shuttle processing, not a larger limit.
