"""Real MediaPipe Pose Landmarker on decoded video frames."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import cv2
import mediapipe as mp
import numpy as np
from mediapipe.tasks.python import vision
from mediapipe.tasks.python.core import base_options as base_options_module
from mediapipe.tasks.python.vision.core import vision_task_running_mode as running_mode

from adapters.media import MediaError, iter_frames

# MediaPipe Pose landmark indices → names we expose in contracts/metrics
POSE_INDEX_TO_NAME = {
    0: "nose",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
}

DEFAULT_MODEL = Path(__file__).resolve().parents[1] / "models" / "pose_landmarker_full.task"


def _resolve_model(model_path: Path | None) -> Path:
    path = model_path or DEFAULT_MODEL
    if not path.exists():
        raise MediaError(
            f"Pose model missing at {path}. Download pose_landmarker_full.task into apps/agent/models/"
        )
    return path


def estimate_pose(
    *,
    video_path: Path | None = None,
    frames: list[tuple[int, float, Any]] | None = None,
    fps: float,
    width: int,
    height: int,
    model_path: Path | None = None,
    max_frames: int | None = None,
    stride: int = 1,
) -> dict[str, Any]:
    """Run PoseLandmarker VIDEO mode over real frames. No synthetic landmarks."""
    model = _resolve_model(model_path)
    options = vision.PoseLandmarkerOptions(
        base_options=base_options_module.BaseOptions(model_asset_path=str(model)),
        running_mode=running_mode.VisionTaskRunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.5,
        min_pose_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    if frames is None:
        if video_path is None:
            raise MediaError("estimate_pose requires video_path or frames")
        frame_iter = iter_frames(video_path, max_frames=max_frames, stride=stride)
    else:
        frame_iter = frames

    frames_out: list[dict[str, Any]] = []
    detected = 0
    with vision.PoseLandmarker.create_from_options(options) as landmarker:
        for frame_index, time_ms, bgr in frame_iter:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            result = landmarker.detect_for_video(mp_image, int(time_ms))
            landmarks: list[dict[str, Any]] = []
            if result.pose_landmarks:
                pose = result.pose_landmarks[0]
                detected += 1
                for idx, name in POSE_INDEX_TO_NAME.items():
                    if idx >= len(pose):
                        continue
                    lm = pose[idx]
                    landmarks.append(
                        {
                            "name": name,
                            "x": float(lm.x * width),
                            "y": float(lm.y * height),
                            "z": float(lm.z),
                            "confidence": float(lm.visibility if hasattr(lm, "visibility") else 0.0),
                        }
                    )
            frames_out.append(
                {
                    "frameIndex": int(frame_index),
                    "timeMs": float(time_ms),
                    "landmarks": landmarks,
                }
            )

    if not frames_out:
        raise MediaError("No frames decoded from video for pose estimation")

    coverage = detected / len(frames_out)
    return {
        "adapter": "mediapipe-pose-landmarker",
        "version": "full-task-1",
        "model": str(model.name),
        "frames": frames_out,
        "detectionCoverage": coverage,
        "detectedFrames": detected,
        "totalFrames": len(frames_out),
    }


def body_visibility_ratio(pose: dict[str, Any]) -> float:
    """Fraction of frames with all core full-body landmarks present.

    Presence-based by design: MediaPipe visibility can be 0 on some builds,
    so this ratio intentionally checks landmark presence only. Callers that
    need confidence-gated checks should filter landmarks before calling.
    """
    required = {
        "nose",
        "left_ankle",
        "right_ankle",
        "left_wrist",
        "right_wrist",
        "left_hip",
        "right_hip",
    }
    ok = 0
    total = 0
    for fr in pose.get("frames", []):
        total += 1
        names = {lm["name"] for lm in fr.get("landmarks", [])}
        if required.issubset(names):
            ok += 1
    return (ok / total) if total else 0.0
