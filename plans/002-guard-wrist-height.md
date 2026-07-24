# Plan 002: Guard wrist_height when shoulder missing

## Why
`metrics_engine.py` uses `sh["y"]` inside `if wr and la and ra` without requiring `sh` → TypeError.

## Steps
Require `sh` in the guard; else withhold with limitation.

## Verify
`python -c` unit snippet or smoke with incomplete landmarks; `/analyze` must not 500.
