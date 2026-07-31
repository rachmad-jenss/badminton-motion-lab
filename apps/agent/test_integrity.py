"""Regression coverage for evidence integrity and the public agent lifecycle."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.byok import _validate_provider_response
from adapters.court import validate_court_corners
from adapters.events import validate_manual_events
from adapters.media import MediaError
from adapters.metrics_engine import compute_metrics
from pipeline.package import AnalysisPackageWriter
import main as agent_main


def test_court_validation_rejects_degenerate_and_out_of_frame_shapes():
    with pytest.raises(MediaError):
        validate_court_corners([{"x": 0, "y": 0}] * 4, width=1280, height=720)
    with pytest.raises(MediaError):
        validate_court_corners(
            [{"x": 0, "y": 0}, {"x": 1281, "y": 0}, {"x": 1281, "y": 720}, {"x": 0, "y": 720}],
            width=1280,
            height=720,
        )
    accepted = validate_court_corners(
        [{"x": 0, "y": 0}, {"x": 1280, "y": 0}, {"x": 1280, "y": 720}, {"x": 0, "y": 720}],
        width=1280,
        height=720,
    )
    assert accepted[2] == {"x": 1280.0, "y": 720.0}


def test_manual_event_validation_rejects_out_of_range_values():
    with pytest.raises(ValueError, match="frameIndex"):
        validate_manual_events(
            [{"type": "contact", "frameIndex": 20, "timeMs": 666.0}],
            frame_count=20,
            duration_ms=1000.0,
        )
    with pytest.raises(ValueError, match="timeMs"):
        validate_manual_events(
            [{"type": "contact", "frameIndex": 2, "timeMs": 1001.0}],
            frame_count=20,
            duration_ms=1000.0,
        )


def test_shoulder_abduction_is_withheld_without_racket_side_evidence():
    pose = {
        "frames": [
            {
                "frameIndex": 0,
                "landmarks": [
                    {"name": "left_hip", "x": 0.4, "y": 0.7, "confidence": 0.9},
                    {"name": "left_shoulder", "x": 0.4, "y": 0.3, "confidence": 0.9},
                    {"name": "left_elbow", "x": 0.2, "y": 0.3, "confidence": 0.9},
                ],
            }
        ]
    }
    metrics = compute_metrics(
        modules=["technique:clear"],
        pose=pose,
        racket={"points": []},
        shuttle={"points": []},
        events={"events": [{"type": "contact", "frameIndex": 0}]},
        court={"valid": False},
        fps=30.0,
    )
    metric = next(item for item in metrics if item["metricId"] == "shoulder_abduction_contact")
    assert metric["withheld"] is True
    assert metric["value"] is None


def test_byok_output_accepts_only_known_citations_and_metrics():
    valid = _validate_provider_response(
        json.dumps(
            {
                "prose": "The measured elbow angle is stable.",
                "citedFindingIds": ["finding-elbow"],
                "citedMetricIds": ["elbow_angle_contact"],
                "fabricatedMetricsAttempted": False,
            }
        ),
        findings=[{"id": "finding-elbow"}],
        metrics=[{"metricId": "elbow_angle_contact", "value": 90.0}],
    )
    assert valid["fabricatedMetricsAttempted"] is False
    with pytest.raises(ValueError, match="unknown metric"):
        _validate_provider_response(
            json.dumps(
                {
                    "prose": "The score is 99.",
                    "citedFindingIds": [],
                    "citedMetricIds": ["invented_metric"],
                    "fabricatedMetricsAttempted": False,
                }
            ),
            findings=[],
            metrics=[{"metricId": "elbow_angle_contact", "value": 90.0}],
        )


def test_capture_register_analyze_run_and_media_ticket_lifecycle(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    media_root = tmp_path / "media"
    media_root.mkdir()
    media = media_root / "clip.mp4"
    media.write_bytes(b"deterministic test media")
    meta = {
        "path": str(media.resolve()),
        "bytes": media.stat().st_size,
        "width": 1280,
        "height": 720,
        "fps": 30.0,
        "durationMs": 1000,
        "frameCount": 30,
    }
    monkeypatch.setenv("BML_MEDIA_ROOTS", str(media_root))
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", agent_main.ByokStore(data / "secrets"))
    monkeypatch.setattr(agent_main, "probe_media", lambda _path: dict(meta))
    monkeypatch.setattr(agent_main, "fingerprint_file", lambda _path: "a" * 64)

    def fake_analyze(body, path_str, fingerprint, metadata_json):
        run_id = "run-lifecycle"
        package = AnalysisPackageWriter(data / "packages" / run_id).write(
            analysis_run_id=run_id,
            capture_id=body.capture_id,
            fingerprint=fingerprint,
            meta=json.loads(metadata_json),
            modules=["technique:clear"],
            quality={"passed": True},
            court={"valid": False},
            pose={},
            racket={},
            shuttle={},
            events={},
            metrics=[],
            findings=[],
            pipeline_version="test",
        )
        return {
            "run_id": run_id,
            "package": package,
            "summary": {"title": "clip", "metrics": [], "findings": [], "events": []},
            "capture_id": body.capture_id,
        }

    monkeypatch.setattr(agent_main, "_run_analyze_sync", fake_analyze)
    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        token = client.post("/pair", json={"pairing_code": health["pairingCode"]}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        registered = client.post(
            "/captures/register", json={"path": str(media)}, headers=headers
        )
        assert registered.status_code == 200
        capture_id = registered.json()["captureId"]
        analyzed = client.post("/analyze", json={"capture_id": capture_id}, headers=headers)
        assert analyzed.status_code == 200, analyzed.text
        run = client.get("/runs", headers=headers)
        assert run.status_code == 200
        assert run.json()["runs"][0]["analysisRunId"] == "run-lifecycle"
        media_url = analyzed.json()["agentMediaUrl"]
        media_path = media_url.split("/media/", 1)[1]
        assert client.get(f"/media/{media_path}").status_code == 200
    with sqlite3.connect(data / "agent.sqlite3") as db:
        assert db.execute("select count(*) from analysis_runs").fetchone()[0] == 1
    assert (data / "packages" / "run-lifecycle" / ".complete").is_file()


def test_analyze_rejects_capture_provenance_drift(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    media_root = tmp_path / "media"
    media_root.mkdir()
    media = media_root / "clip.mp4"
    media.write_bytes(b"original")
    meta = {
        "path": str(media.resolve()),
        "bytes": media.stat().st_size,
        "width": 1280,
        "height": 720,
        "fps": 30.0,
        "durationMs": 1000,
        "frameCount": 30,
    }
    fingerprints = iter(["a" * 64, "b" * 64])
    monkeypatch.setenv("BML_MEDIA_ROOTS", str(media_root))
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", agent_main.ByokStore(data / "secrets"))
    monkeypatch.setattr(agent_main, "probe_media", lambda _path: dict(meta))
    monkeypatch.setattr(agent_main, "fingerprint_file", lambda _path: next(fingerprints))
    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        token = client.post("/pair", json={"pairing_code": health["pairingCode"]}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        capture_id = client.post(
            "/captures/register", json={"path": str(media)}, headers=headers
        ).json()["captureId"]
        response = client.post("/analyze", json={"capture_id": capture_id}, headers=headers)
        assert response.status_code == 409
        assert "changed" in response.json()["detail"]


def test_analyze_rejects_malformed_manual_inputs_before_lookup(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", agent_main.ByokStore(data / "secrets"))
    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        token = client.post("/pair", json={"pairing_code": health["pairingCode"]}).json()["token"]
        response = client.post(
            "/analyze",
            headers={"Authorization": f"Bearer {token}"},
            json={
                "capture_id": "missing",
                "court_corners": [{"x": 0, "y": 0}] * 4,
                "manual_events": [{"type": "unknown", "frameIndex": 0, "timeMs": 0}],
            },
        )
        assert response.status_code == 422
