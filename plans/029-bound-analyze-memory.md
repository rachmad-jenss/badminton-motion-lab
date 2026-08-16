# Plan 29: Bound analysis decode memory with a pixel budget (anti-OOM)

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

The Local Agent decodes frames at native resolution and holds the whole list in
memory during analysis; the cap is frame-count only (600 max). A 4K clip at the
cap is ~15 GB of BGR arrays — enough to OOM a typical Windows machine. CI never
catches it (`BML_BENCH_MAX_FRAMES=60` on 720p). A pixel budget bounds worst-case
decode memory to ~830 MB regardless of resolution, with zero adapter changes.

## Current state

- `apps/agent/main.py:49-55` — `MAX_ANALYSIS_FRAMES` (600), `DEFAULT_MAX_FRAMES` (300), `DEFAULT_STRIDE`.
- `apps/agent/main.py:128-139` — `resolve_frame_window(frame_count, requested_max_frames, requested_stride)`; no resolution term.
- `apps/agent/main.py:531-537` — call site `resolve_frame_window(frame_count, body.max_frames, body.frame_stride)`.
- `apps/agent/test_security.py:132-133` — existing 3-arg calls:
  ```python
  assert agent_main.resolve_frame_window(1800, None, None) == (300, 6, False)
  assert agent_main.resolve_frame_window(1800, 300, 1) == (300, 1, True)
  ```

## Scope

**In scope**: `apps/agent/main.py`, `apps/agent/test_security.py`.
**Out of scope**: `apps/agent/adapters/media.py` (decode stays native-res), web response-shape changes.

## Steps

1. In `main.py` after `DEFAULT_STRIDE`, add:
   ```python
   # Total decoded pixel budget across the frame window (anti-OOM): at 720p this
   # matches the default 300-frame window (~830 MB of BGR arrays worst case).
   MAX_ANALYSIS_PIXELS = int(os.getenv("BML_MAX_ANALYSIS_PIXELS", str(1280 * 720 * 300)))
   ```
2. Change `resolve_frame_window` signature to add `width: int = 0, height: int = 0`; after the
   `max_frames = min(...)` line insert:
   ```python
       if width > 0 and height > 0:
           pixel_max_frames = MAX_ANALYSIS_PIXELS // max(1, width * height)
           max_frames = min(max_frames, pixel_max_frames)
   ```
3. At the call site pass `width=width, height=height` (`width`/`height` already bound from `meta`).
4. In `summary["frameWindow"]` add `"pixelBudget": MAX_ANALYSIS_PIXELS,` (additive; web ignores it).
5. In `test_security.py` after the existing assertions add:
   ```python
   # Pixel budget bounds high-resolution decode windows (anti-OOM)
   assert agent_main.resolve_frame_window(300, None, None, width=3840, height=2160) == (33, 1, True)
   assert agent_main.resolve_frame_window(1800, None, None, width=1280, height=720) == (300, 6, False)
   ```
   (1280*720*300 // 8294400 = 33; 276480000 // 921600 = 300.)

## Test plan

- `npm.cmd run test:agent` — pytest suites + real-pipeline smoke must pass; the two new
  pixel-budget assertions must pass.

## Done criteria

- [ ] `python -m py_compile apps/agent/main.py` exits 0
- [ ] `npm.cmd run test:agent` passes
- [ ] `git status --short` shows only `apps/agent/main.py` and `apps/agent/test_security.py` modified

## STOP conditions

- Signature/call-site drift from the excerpts.
- Smoke test fails on real video after the change (report; do not loosen the budget silently).

## Maintenance notes

- Memory scales linearly with the budget. Keep `BML_MAX_ANALYSIS_FRAMES` for frame-count caps.
- Re-run domain benchmarks on the maintainer machine after this lands (thresholds are
  resolution-agnostic, but evidence should be re-collected).
