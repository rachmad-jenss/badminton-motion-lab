# Capture profile — side-ish full body v1

## Required
- Full body visible (head to feet)
- Camera roughly side-on (recommended guidance; yaw is not automatically checked yet)
- Min 1280×720
- Min 30 fps
- Adequate lighting (mean luma 40–220)

## Enforced by the automatic gate (apps/agent/adapters/quality.py)

- Min 1280×720 resolution
- Min 30 fps
- Mean luma between 40 and 220
- Scene structure: mean edge ratio ≥ 0.002 (blur / low-texture rejection)
- Full-body landmark presence on ≥ 50% of sampled frames (body_visibility_ratio ≥ 0.5)

Failed checks → analysis rejected before perception (Honest Uncertainty).
Yaw (±35°) is recommended guidance only and is not measured by the current gate.

## Footwork
Court calibration required (auto lines → manual 4 corners). Without valid court, Footwork modules stay withheld / not `on` for that run.
