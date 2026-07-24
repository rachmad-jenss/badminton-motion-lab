"""Smoke tests for the real media/pose pipeline (requires FFmpeg + pose model)."""

from __future__ import annotations

from pathlib import Path

from adapters.court import calibrate_court
from adapters.media import probe_media, sample_frame_stats
from adapters.pose import body_visibility_ratio, estimate_pose
from adapters.quality import run_quality_gate
from adapters.racket import track_racket
from adapters.shuttle import track_shuttle
from pipeline.technique_unlock import all_footwork_layer_modules, all_technique_modules

ROOT = Path(__file__).resolve().parents[2]
FIXTURE = ROOT / "validation" / "fixtures" / "person_1280x720_30fps.mp4"


def test_probe_real_video():
    assert FIXTURE.exists(), f"Missing fixture {FIXTURE}"
    meta = probe_media(FIXTURE)
    assert meta["width"] == 1280
    assert meta["height"] == 720
    assert meta["fps"] >= 29.0
    assert meta["durationMs"] > 0


def test_pose_and_quality_on_real_video():
    meta = probe_media(FIXTURE)
    stats = sample_frame_stats(FIXTURE)
    pose = estimate_pose(
        video_path=FIXTURE,
        fps=meta["fps"],
        width=meta["width"],
        height=meta["height"],
        max_frames=60,
        stride=2,
    )
    assert pose["adapter"] == "mediapipe-pose-landmarker"
    assert pose["detectedFrames"] > 0
    vis = body_visibility_ratio(pose)
    quality = run_quality_gate(
        width=meta["width"],
        height=meta["height"],
        fps=meta["fps"],
        frame_count=meta["frameCount"],
        mean_brightness=stats["meanBrightness"],
        body_visibility_ratio=vis,
        mean_edge_ratio=stats["meanEdgeRatio"],
    )
    assert "checks" in quality
    racket = track_racket(pose_frames=pose["frames"], fps=meta["fps"])
    assert racket["coverage"] > 0
    court = calibrate_court(
        video_path=FIXTURE, width=meta["width"], height=meta["height"], manual_corners=None
    )
    assert "method" in court
    shuttle = track_shuttle(
        video_path=FIXTURE,
        fps=meta["fps"],
        width=meta["width"],
        height=meta["height"],
        pose_frames=pose["frames"],
        max_frames=60,
        stride=2,
    )
    # Shuttle may be empty on non-badminton footage; coverage is still a real measurement
    assert "coverage" in shuttle
    assert "points" in shuttle


def test_module_inventory_complete():
    assert len(all_technique_modules()) == 12
    assert len(all_footwork_layer_modules()) == 12


if __name__ == "__main__":
    test_probe_real_video()
    test_pose_and_quality_on_real_video()
    test_module_inventory_complete()
    print("real pipeline smoke tests OK")
