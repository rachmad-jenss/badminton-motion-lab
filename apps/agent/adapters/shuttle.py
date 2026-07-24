"""Shuttle track from real video via motion differencing + blob detection."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import numpy as np

from adapters.media import MediaError, iter_frames


def track_shuttle(
    *,
    video_path: Path | None = None,
    frames: list[tuple[int, float, Any]] | None = None,
    fps: float,
    width: int,
    height: int,
    pose_frames: list[dict[str, Any]] | None = None,
    max_frames: int | None = None,
    stride: int = 1,
) -> dict[str, Any]:
    """Detect small fast-moving blobs, suppressing body region from pose when available."""
    prev_gray = None
    points: list[dict[str, Any]] = []
    pose_by_idx = {fr["frameIndex"]: fr for fr in (pose_frames or [])}

    if frames is None:
        if video_path is None:
            raise MediaError("track_shuttle requires video_path or frames")
        frame_iter = iter_frames(video_path, max_frames=max_frames, stride=stride)
    else:
        frame_iter = frames

    for frame_index, time_ms, bgr in frame_iter:
        gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
        gray = cv2.GaussianBlur(gray, (5, 5), 0)
        if prev_gray is None:
            prev_gray = gray
            continue
        diff = cv2.absdiff(prev_gray, gray)
        prev_gray = gray
        _, th = cv2.threshold(diff, 25, 255, cv2.THRESH_BINARY)
        th = cv2.morphologyEx(th, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))

        # Suppress body region
        mask = np.ones_like(th) * 255
        fr_pose = pose_by_idx.get(frame_index)
        if fr_pose and fr_pose.get("landmarks"):
            xs = [lm["x"] for lm in fr_pose["landmarks"]]
            ys = [lm["y"] for lm in fr_pose["landmarks"]]
            x1, x2 = max(int(min(xs) - 40), 0), min(int(max(xs) + 40), width - 1)
            y1, y2 = max(int(min(ys) - 40), 0), min(int(max(ys) + 40), height - 1)
            mask[y1:y2, x1:x2] = 0
        th = cv2.bitwise_and(th, mask)

        contours, _ = cv2.findContours(th, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 3 or area > 400:
                continue
            x, y, w, h = cv2.boundingRect(cnt)
            aspect = w / max(h, 1)
            if aspect > 4 or aspect < 0.2:
                continue
            cx, cy = x + w / 2.0, y + h / 2.0
            candidates.append((area, cx, cy))

        if not candidates:
            continue
        # Prefer smaller high-motion blobs (shuttle-like)
        candidates.sort(key=lambda c: c[0])
        _, cx, cy = candidates[0]
        points.append(
            {
                "frameIndex": int(frame_index),
                "timeMs": float(time_ms),
                "x": float(cx),
                "y": float(cy),
                "confidence": 0.7,
                "interpolated": False,
            }
        )

    points = _smooth_and_fill(points, max_gap=4)
    coverage = 0.0
    # Approximate total frames from last index
    if points:
        total_est = max(p["frameIndex"] for p in points) + 1
        coverage = sum(1 for p in points if not p["interpolated"]) / max(total_est / max(stride, 1), 1)

    if not points:
        raise MediaError(
            "No shuttle motion blobs detected — use brighter shuttle / higher shutter / clearer contrast"
        )

    return {
        "adapter": "opencv-motion-blob-shuttle",
        "version": "1.0.0",
        "points": points,
        "coverage": min(1.0, coverage),
    }


def _smooth_and_fill(points: list[dict[str, Any]], max_gap: int) -> list[dict[str, Any]]:
    if len(points) < 2:
        return points
    # EMA smooth
    sm = [dict(points[0])]
    alpha = 0.4
    for p in points[1:]:
        prev = sm[-1]
        sm.append(
            {
                **p,
                "x": alpha * p["x"] + (1 - alpha) * prev["x"],
                "y": alpha * p["y"] + (1 - alpha) * prev["y"],
            }
        )
    # gap fill
    out = [sm[0]]
    for i in range(1, len(sm)):
        prev, cur = sm[i - 1], sm[i]
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
                        "confidence": 0.35,
                        "interpolated": True,
                    }
                )
        out.append(cur)
    return out
