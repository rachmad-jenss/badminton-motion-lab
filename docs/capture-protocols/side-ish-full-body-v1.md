# Capture profile — side-ish full body v1

## Required
- Full body visible (head to feet)
- Camera roughly side-on (recommended guidance; yaw is not automatically checked yet)
- Min 720×480 effective resolution (portrait and landscape are accepted; 1280×720 is recommended)
- Nominal 30 fps (small metadata rounding differences are accepted)
- Adequate lighting (mean luma 40–220)

## Enforced by the automatic gate (apps/agent/adapters/quality.py)

- Min 720×480 effective resolution
- Nominal 30 fps with a 0.5 fps tolerance
- Mean luma between 40 and 220
- Scene structure: mean edge ratio ≥ 0.002 (blur / low-texture rejection)
- Full-body landmark presence on ≥ 50% of sampled frames (body_visibility_ratio ≥ 0.5)

Failed checks → analysis rejected before downstream analysis (Honest Uncertainty). A capture below the recommended resolution continues with a quality warning when it meets the minimum effective dimensions. Pose estimation runs first so the gate can judge body visibility, but no metrics or findings are produced for rejected captures.
Yaw (±35°) is recommended guidance only and is not measured by the current gate.

## Footwork
Court calibration required (auto lines → manual 4 corners). Without valid court, Footwork modules stay withheld / not `on` for that run.
