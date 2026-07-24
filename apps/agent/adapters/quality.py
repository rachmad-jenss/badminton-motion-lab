"""Capture quality gate using real ffprobe metadata + sampled frame stats + pose coverage."""

from __future__ import annotations

from typing import Any


THRESHOLDS = {
    "minWidth": 1280,
    "minHeight": 720,
    "minFps": 30,
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
    checks = [
        {
            "id": "min_width",
            "passed": width >= THRESHOLDS["minWidth"],
            "measured": width,
            "threshold": THRESHOLDS["minWidth"],
            "message": "Minimum width 1280",
        },
        {
            "id": "min_height",
            "passed": height >= THRESHOLDS["minHeight"],
            "measured": height,
            "threshold": THRESHOLDS["minHeight"],
            "message": "Minimum height 720",
        },
        {
            "id": "min_fps",
            "passed": fps >= THRESHOLDS["minFps"],
            "measured": fps,
            "threshold": THRESHOLDS["minFps"],
            "message": "Minimum 30 fps",
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
    return {
        "passed": all(c["passed"] for c in checks),
        "checks": checks,
        "captureProfile": THRESHOLDS["profileId"],
    }
