"""Capture quality gate using real ffprobe metadata + sampled frame stats + pose coverage."""

from __future__ import annotations

from typing import Any


THRESHOLDS = {
    "minWidth": 720,
    "minHeight": 480,
    "recommendedWidth": 1280,
    "recommendedHeight": 720,
    "minFps": 30,
    "fpsTolerance": 0.5,
    "minBrightness": 40.0,
    "maxBrightness": 220.0,
    "minBodyVisibilityRatio": 0.5,
    "minEdgeRatio": 0.002,
    "profileId": "side_ish_full_body_v1",
}


def run_quality_gate(
    *,
    width: int,
    height: int,
    fps: float,
    frame_count: int,
    mean_brightness: float,
    body_visibility_ratio: float,
    mean_edge_ratio: float,
) -> dict[str, Any]:
    effective_width = max(width, height)
    effective_height = min(width, height)
    minimum_fps = THRESHOLDS["minFps"] - THRESHOLDS["fpsTolerance"]
    checks = [
        {
            "id": "min_width",
            "passed": effective_width >= THRESHOLDS["minWidth"],
            "measured": effective_width,
            "threshold": THRESHOLDS["minWidth"],
            "message": "Minimum effective video width 720",
        },
        {
            "id": "min_height",
            "passed": effective_height >= THRESHOLDS["minHeight"],
            "measured": effective_height,
            "threshold": THRESHOLDS["minHeight"],
            "message": "Minimum effective video height 480",
        },
        {
            "id": "min_fps",
            "passed": fps >= minimum_fps,
            "measured": fps,
            "threshold": THRESHOLDS["minFps"],
            "message": "Target 30 fps (0.5 fps tolerance)",
        },
        {
            "id": "brightness",
            "passed": THRESHOLDS["minBrightness"] <= mean_brightness <= THRESHOLDS["maxBrightness"],
            "measured": mean_brightness,
            "threshold": f"{THRESHOLDS['minBrightness']}-{THRESHOLDS['maxBrightness']}",
            "message": "Lighting within usable range",
        },
        {
            "id": "scene_structure",
            "passed": mean_edge_ratio >= THRESHOLDS["minEdgeRatio"],
            "measured": mean_edge_ratio,
            "threshold": THRESHOLDS["minEdgeRatio"],
            "message": "Frame must contain structured scene edges",
        },
        {
            "id": "body_visibility",
            "passed": body_visibility_ratio >= THRESHOLDS["minBodyVisibilityRatio"],
            "measured": body_visibility_ratio,
            "threshold": THRESHOLDS["minBodyVisibilityRatio"],
            "message": "Pose must see full-body landmarks on enough frames",
        },
        {
            "id": "non_empty",
            "passed": frame_count > 0,
            "measured": frame_count,
            "threshold": 1,
            "message": "Video must contain frames",
        },
    ]
    warnings = []
    if (
        effective_width < THRESHOLDS["recommendedWidth"]
        or effective_height < THRESHOLDS["recommendedHeight"]
    ):
        warnings.append(
            {
                "id": "recommended_resolution",
                "passed": False,
                "measured": f"{effective_width}x{effective_height}",
                "threshold": f"{THRESHOLDS['recommendedWidth']}x{THRESHOLDS['recommendedHeight']}",
                "message": "Recommended capture resolution is 1280x720; analysis can continue with lower resolution.",
            }
        )
    return {
        "passed": all(c["passed"] for c in checks),
        "checks": checks,
        "warnings": warnings,
        "captureProfile": THRESHOLDS["profileId"],
    }
