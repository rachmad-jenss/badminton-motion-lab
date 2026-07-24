# Plan 007: Single-pass decode + offload analyze

## Why
Multiple VideoCapture opens; sync MediaPipe blocks event loop.

## Steps
1. Shared `decode_frames(path, stride, max)` returning list of (idx, t, bgr).
2. Pose/shuttle/court/quality consume shared frames.
3. `asyncio.to_thread` for analyze body.

## Verify
`/health` responds during analyze; analyze still succeeds.
