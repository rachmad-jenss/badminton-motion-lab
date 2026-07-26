"""Racket tip track derived from real pose wrist/elbow (no synthetic path)."""

from __future__ import annotations

from typing import Any


def track_racket(
    *, pose_frames: list[dict[str, Any]], fps: float, dominant_hand: str = "unknown"
) -> dict[str, Any]:
    points: list[dict[str, Any]] = []
    for fr in pose_frames:
        by_name = {lm["name"]: lm for lm in fr.get("landmarks", [])}
        candidates = [
            (dominant_hand, by_name.get(f"{dominant_hand}_wrist"), by_name.get(f"{dominant_hand}_elbow"))
        ] if dominant_hand in {"left", "right"} else [
            (side, by_name.get(f"{side}_wrist"), by_name.get(f"{side}_elbow"))
            for side in ("left", "right")
        ]
        available = [(side, wrist, elbow) for side, wrist, elbow in candidates if wrist]
        if not available:
            continue
        _, wrist, elbow = max(available, key=lambda item: float(item[1].get("confidence") or 0.0))
        if not wrist:
            continue
        # Extrapolate tip beyond wrist along elbow→wrist direction
        if elbow:
            dx = wrist["x"] - elbow["x"]
            dy = wrist["y"] - elbow["y"]
            tip_x = wrist["x"] + 0.45 * dx
            tip_y = wrist["y"] + 0.45 * dy
        else:
            tip_x, tip_y = wrist["x"], wrist["y"]
        conf = float(wrist.get("confidence") or 0.5)
        points.append(
            {
                "frameIndex": fr["frameIndex"],
                "timeMs": fr["timeMs"],
                "x": float(tip_x),
                "y": float(tip_y),
                "confidence": conf,
                "interpolated": False,
            }
        )

    # Fill small gaps by linear interpolation (mark interpolated=True)
    points = _interpolate_gaps(points, max_gap=3)
    coverage = 0.0
    if pose_frames:
        coverage = sum(1 for p in points if not p["interpolated"]) / len(pose_frames)
    return {
        "adapter": "pose-wrist-extrapolated-racket",
        "version": "1.0.0",
        "points": points,
        "coverage": coverage,
    }


def _interpolate_gaps(points: list[dict[str, Any]], max_gap: int) -> list[dict[str, Any]]:
    if len(points) < 2:
        return points
    out = [points[0]]
    for i in range(1, len(points)):
        prev, cur = points[i - 1], points[i]
        gap = cur["frameIndex"] - prev["frameIndex"]
        if 1 < gap <= max_gap + 1:
            for step in range(1, gap):
                t = step / gap
                out.append(
                    {
                        "frameIndex": prev["frameIndex"] + step,
                        "timeMs": prev["timeMs"] + t * (cur["timeMs"] - prev["timeMs"]),
                        "x": prev["x"] + t * (cur["x"] - prev["x"]),
                        "y": prev["y"] + t * (cur["y"] - prev["y"]),
                        "confidence": min(prev["confidence"], cur["confidence"]) * 0.7,
                        "interpolated": True,
                    }
                )
        out.append(cur)
    return out
