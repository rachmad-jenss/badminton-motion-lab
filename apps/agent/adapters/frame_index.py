"""Shared helpers for pose frame lookup by video frameIndex."""

from __future__ import annotations

from typing import Any


def index_frames_by_frame_index(frames: list[dict[str, Any]]) -> dict[int, dict[str, Any]]:
    return {int(fr["frameIndex"]): fr for fr in frames if "frameIndex" in fr}


def get_frame(
    by_index: dict[int, dict[str, Any]],
    frame_index: int,
) -> dict[str, Any] | None:
    if frame_index in by_index:
        return by_index[frame_index]
    # nearest available frame
    if not by_index:
        return None
    nearest = min(by_index.keys(), key=lambda k: abs(k - frame_index))
    return by_index[nearest]
