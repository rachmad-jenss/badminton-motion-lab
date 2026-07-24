"""Real media inspection via ffprobe and frame decoding via OpenCV."""

from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
from pathlib import Path
from typing import Any, Iterator

import cv2
import numpy as np


class MediaError(RuntimeError):
    pass


def require_ffmpeg() -> str:
    exe = shutil.which("ffprobe")
    if not exe:
        raise MediaError("ffprobe not found on PATH — install FFmpeg")
    return exe


def fingerprint_file(path: Path, chunk_size: int = 1024 * 1024) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()


def probe_media(path: Path) -> dict[str, Any]:
    """Return real width/height/fps/duration/codec from ffprobe."""
    require_ffmpeg()
    cmd = [
        "ffprobe",
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=width,height,avg_frame_rate,nb_frames,codec_name,duration:format=duration,size",
        "-of",
        "json",
        str(path),
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=False)
    if proc.returncode != 0:
        raise MediaError(f"ffprobe failed: {proc.stderr.strip()}")
    data = json.loads(proc.stdout)
    streams = data.get("streams") or []
    if not streams:
        raise MediaError("No video stream found")
    stream = streams[0]
    fmt = data.get("format") or {}

    width = int(stream.get("width") or 0)
    height = int(stream.get("height") or 0)
    if width <= 0 or height <= 0:
        raise MediaError("Invalid video dimensions")

    fps = _parse_rate(stream.get("avg_frame_rate") or "0/0")
    duration = float(stream.get("duration") or fmt.get("duration") or 0.0)
    if duration <= 0 and fps > 0 and stream.get("nb_frames"):
        duration = float(stream["nb_frames"]) / fps
    if duration <= 0:
        # Fallback via OpenCV
        cap = cv2.VideoCapture(str(path))
        if not cap.isOpened():
            raise MediaError("OpenCV cannot open video")
        frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        fps_cv = float(cap.get(cv2.CAP_PROP_FPS) or 0) or fps
        cap.release()
        if frame_count > 0 and fps_cv > 0:
            duration = frame_count / fps_cv
            fps = fps or fps_cv
    if fps <= 0:
        raise MediaError("Could not determine FPS")
    if duration <= 0:
        raise MediaError("Could not determine duration")

    return {
        "path": str(path.resolve()),
        "bytes": int(fmt.get("size") or path.stat().st_size),
        "width": width,
        "height": height,
        "fps": float(fps),
        "durationMs": int(duration * 1000),
        "frameCount": int(round(duration * fps)),
        "codec": stream.get("codec_name"),
    }


def _parse_rate(rate: str) -> float:
    if not rate or rate == "0/0":
        return 0.0
    if "/" in rate:
        num, den = rate.split("/", 1)
        den_f = float(den)
        return float(num) / den_f if den_f else 0.0
    return float(rate)


def iter_frames(
    path: Path,
    *,
    max_frames: int | None = None,
    stride: int = 1,
) -> Iterator[tuple[int, float, np.ndarray]]:
    """Yield (frame_index, time_ms, BGR frame) from a real video file."""
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise MediaError(f"Cannot open video: {path}")
    fps = float(cap.get(cv2.CAP_PROP_FPS) or 30.0) or 30.0
    idx = 0
    emitted = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            if idx % stride == 0:
                time_ms = (idx / fps) * 1000.0
                yield idx, time_ms, frame
                emitted += 1
                if max_frames is not None and emitted >= max_frames:
                    break
            idx += 1
    finally:
        cap.release()


def sample_frame_stats(path: Path, sample_count: int = 12) -> dict[str, Any]:
    """Brightness/structure stats from a light decode pass."""
    frames = decode_frames(path, max_frames=max(sample_count * 10, 30), stride=2)
    stats = sample_frame_stats_from_frames(frames)
    return stats


def decode_frames(
    path: Path,
    *,
    max_frames: int | None = None,
    stride: int = 1,
) -> list[tuple[int, float, np.ndarray]]:
    """Decode video once into memory for shared pose/shuttle/court consumers."""
    return list(iter_frames(path, max_frames=max_frames, stride=stride))


def sample_frame_stats_from_frames(frames: list[tuple[int, float, np.ndarray]]) -> dict[str, Any]:
    if not frames:
        raise MediaError("No frames to sample")
    picks = np.linspace(0, len(frames) - 1, num=min(12, len(frames)), dtype=int)
    luminances = []
    edge_ratios = []
    for i in picks:
        _, _, fr = frames[int(i)]
        gray = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
        luminances.append(float(np.mean(gray)))
        edges = cv2.Canny(gray, 60, 150)
        h, w = edges.shape
        mid = edges[int(h * 0.15) : int(h * 0.95), int(w * 0.1) : int(w * 0.9)]
        edge_ratios.append(float(np.count_nonzero(mid)) / float(mid.size))
    return {
        "meanBrightness": float(np.mean(luminances)),
        "minBrightness": float(np.min(luminances)),
        "maxBrightness": float(np.max(luminances)),
        "meanEdgeRatio": float(np.mean(edge_ratios)),
        "sampledFrames": len(picks),
        "frameCount": len(frames),
    }
