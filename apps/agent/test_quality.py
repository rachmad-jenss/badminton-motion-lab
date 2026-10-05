"""Regression coverage for user-facing capture quality thresholds."""

from __future__ import annotations

from adapters.quality import run_quality_gate


def _quality(*, width: int, height: int, fps: float):
    return run_quality_gate(
        width=width,
        height=height,
        fps=fps,
        frame_count=120,
        mean_brightness=100.0,
        body_visibility_ratio=0.9,
        mean_edge_ratio=0.01,
    )


def test_accepts_portrait_720p_with_nominal_30_fps_metadata():
    result = _quality(width=720, height=1280, fps=29.993252133778327)

    assert result["passed"] is True
    assert result["warnings"] == []


def test_allows_lower_resolution_with_a_recommendation_warning():
    result = _quality(width=960, height=720, fps=30.0)

    assert result["passed"] is True
    assert [warning["id"] for warning in result["warnings"]] == ["recommended_resolution"]


def test_rejects_materially_small_video():
    result = _quality(width=640, height=360, fps=30.0)

    assert result["passed"] is False
    assert {check["id"] for check in result["checks"] if not check["passed"]} == {
        "min_width",
        "min_height",
    }


def test_rejects_fps_below_tolerance():
    result = _quality(width=1280, height=720, fps=29.4)

    assert result["passed"] is False
    assert [check["id"] for check in result["checks"] if not check["passed"]] == ["min_fps"]
