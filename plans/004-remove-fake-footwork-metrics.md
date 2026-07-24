# Plan 004: Remove fabricated footwork metric constants

## Why
Constants (0.2, 4.5, 0.72, 0.9, split_step_count=1) contradict “no fabricated metrics”.

## Steps
Compute from pose+court when possible; otherwise `withheld=True`. Delete constant fillers. Keep real split_step timing / stance when events exist.

## Verify
No metric with those constant values when court valid; compare series only real values.
