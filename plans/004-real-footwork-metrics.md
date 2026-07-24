# Plan 004: Remove fabricated footwork metric constants

## Status
- **Priority**: P1 · **Effort**: M · **Risk**: MED · **Depends on**: 003 · **Category**: bug / arch  
- Honors `docs/metrics/README.md` and README “no fabricated metrics”.

## Why
When court is valid, footwork metrics emit constants (`4.5`, `0.72`, `0.2`, …). Compare/BYOK treat them as measurements.

## Current state
`apps/agent/adapters/metrics_engine.py` ~155–159 hardcodes values.

## Steps
1. Delete constant emitters for `first_step_latency`, `court_coverage_area`, `path_efficiency`, `landing_symmetry`, `split_step_count` unless computed.
2. Implement real estimators where evidence exists:
   - `split_step_count` from events of type split_step
   - `court_coverage_area` / path metrics from ankle trajectory × homography when court.valid
   - `landing_symmetry` from left/right ankle vertical motion if enough frames; else withhold
3. Never invent numbers; withhold with limitation string.
4. Unit tests covering withhold vs computed paths.

## Verify
- Tests assert no constant 4.5/0.72 when pose empty
- Smoke still passes
