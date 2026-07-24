# Plan 003: Look up pose frames by frameIndex

## Why
With `stride>1`, `pose_frames[best_i]` treats video frameIndex as list index → IndexError/wrong metrics.

## Steps
Add helper `index_by_frame(frames)`; use in `events.py` and `metrics_engine.py` for all pose lookups. Fail soft if missing.

## Verify
Analyze with `frame_stride=2` returns 200 and coherent contact frameIndex.
