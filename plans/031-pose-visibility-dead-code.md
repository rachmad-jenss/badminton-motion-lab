# Plan 31: Remove dead confidence logic in body_visibility_ratio

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

`body_visibility_ratio` (quality-gate input) computes a `present` set filtered by
`min_conf` but then decides using an unfiltered `names` set — the confidence filter is
dead code and the `min_conf` parameter is misleading. The gate is intentionally
presence-based (MediaPipe visibility can be 0 on some builds); the honest fix is to
delete the dead computation and document the presence semantics.

## Current state

`apps/agent/adapters/pose.py:98-116`:
```python
def body_visibility_ratio(pose: dict[str, Any], min_conf: float = 0.4) -> float:
    required = {...7 landmarks...}
    ok = 0
    total = 0
    for fr in pose.get("frames", []):
        total += 1
        present = {
            lm["name"]
            for lm in fr.get("landmarks", [])
            if lm.get("confidence", 0) >= min_conf or lm.get("name") in required
        }
        # Prefer confidence when available; visibility can be 0 on some builds — also accept presence
        names = {lm["name"] for lm in fr.get("landmarks", [])}
        if required.issubset(names):
            ok += 1
    return (ok / total) if total else 0.0
```

Callers (all use the default): `main.py:554`, `smoke_test.py:41`, `perception.py:3,12` (import only).

## Scope

**In scope**: `apps/agent/adapters/pose.py`.
**Out of scope**: behavior of the quality gate itself (presence semantics preserved — no re-benchmark needed).

## Steps

1. Replace the function body with:
   ```python
   def body_visibility_ratio(pose: dict[str, Any]) -> float:
       """Fraction of frames with all core full-body landmarks present.

       Presence-based by design: MediaPipe visibility can be 0 on some builds,
       so this ratio intentionally checks landmark presence only. Callers that
       need confidence-gated checks should filter landmarks before calling.
       """
       required = {...same set...}
       ok = 0
       total = 0
       for fr in pose.get("frames", []):
           total += 1
           names = {lm["name"] for lm in fr.get("landmarks", [])}
           if required.issubset(names):
               ok += 1
       return (ok / total) if total else 0.0
   ```
2. Do not touch callers (they never pass `min_conf`).

## Test plan

- `npm.cmd run test:agent` — pytest + real-pipeline smoke pass (smoke asserts `vis` usage in the gate).

## Done criteria

- [ ] No `min_conf` or `present =` remains in `pose.py`
- [ ] `npm.cmd run test:agent` passes
- [ ] `git status --short` shows only `apps/agent/adapters/pose.py` modified

## STOP conditions

- Any caller passing `min_conf` is discovered (then update that caller instead).

## Maintenance notes

- If visibility confidence becomes reliable across supported builds, reintroduce a
  confidence-gated variant behind the same name with tests.
