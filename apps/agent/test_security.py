"""Unit tests for auth/path allowlist and BYOK encryption (no MediaPipe)."""

from __future__ import annotations

import os
import sqlite3
import tempfile
import asyncio
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.byok import ByokStore, run_insight
from adapters.events import propose_events
from adapters.media import MediaError
from adapters.metrics_engine import compute_metrics
from adapters.paths import assert_allowed_media_path
from adapters.racket import track_racket
from pipeline.package import AnalysisPackageWriter, validate_analysis_manifest
import main as agent_main


def test_byok_encrypted_not_plaintext():
    with tempfile.TemporaryDirectory() as tmp:
        store = ByokStore(Path(tmp) / "secrets")
        store.set_key(provider="openai", api_key="sk-test-secret", model="gpt-4o-mini")
        assert store.enc_path.exists()
        assert not store.path.exists()
        raw = store.enc_path.read_bytes()
        assert b"sk-test-secret" not in raw
        if os.name == "nt":
            assert raw.startswith(b"BML-DPAPI\x00")
            assert not (Path(tmp) / "secrets" / ".byok_key").exists()
        loaded = store.load()
        assert loaded is not None
        assert loaded["api_key"] == "sk-test-secret"


def test_byok_empty_choices_falls_back(monkeypatch: pytest.MonkeyPatch):
    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": []}

    class FakeClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def post(self, *_args, **_kwargs):
            return FakeResponse()

    store = ByokStore(Path("unused"))
    monkeypatch.setattr(store, "load", lambda: {"provider": "openai", "api_key": "test"})
    monkeypatch.setattr("adapters.byok.httpx.AsyncClient", lambda **_kwargs: FakeClient())

    result = asyncio.run(run_insight(byok=store, findings=[], metrics=[], locale="en"))

    assert result["byokUsed"] is True
    assert "rejected safely" in result["warning"]


def test_allowlist_rejects_secrets_and_non_video(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "data"
    secrets = data / "secrets"
    secrets.mkdir(parents=True)
    secret_file = secrets / "byok.enc"
    secret_file.write_bytes(b"x")
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    video = fixtures / "clip.mp4"
    video.write_bytes(b"\x00\x00")
    monkeypatch.setenv("BML_MEDIA_ROOTS", str(fixtures))
    with pytest.raises(MediaError):
        assert_allowed_media_path(secret_file, data_dir=data)
    bad = fixtures / "notes.txt"
    bad.write_text("nope")
    with pytest.raises(MediaError):
        assert_allowed_media_path(bad, data_dir=data)
    ok = assert_allowed_media_path(video, data_dir=data)
    assert ok == video.resolve()


def test_analyze_requires_bearer(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    data.mkdir()
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", ByokStore(data / "secrets"))

    with TestClient(agent_main.app) as client:
        r = client.get("/health")
        assert r.status_code == 200
        r = client.post("/analyze", json={"capture_id": "x"})
        assert r.status_code == 401
        health = client.get("/health").json()
        pair = client.post("/pair", json={"pairing_code": "wrong", "device_name": "test"})
        assert pair.status_code == 401
        pair = client.post(
            "/pair", json={"pairing_code": health["pairingCode"], "device_name": "test"}
        )
        assert pair.status_code == 200
        token = pair.json()["token"]
        assert client.post(
            "/pair", json={"pairing_code": health["pairingCode"], "device_name": "again"}
        ).status_code == 401
        with sqlite3.connect(data / "agent.sqlite3") as db:
            stored_token, stored_hash = db.execute(
                "SELECT token, token_hash FROM devices"
            ).fetchone()
        assert stored_token == ""
        assert stored_hash and stored_hash != token
        assert client.get(f"/runs?access_token={token}").status_code == 401
        r = client.post(
            "/analyze",
            json={"capture_id": "missing"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404
        assert client.post("/auth/revoke", headers={"Authorization": f"Bearer {token}"}).status_code == 200
        assert client.get("/runs", headers={"Authorization": f"Bearer {token}"}).status_code == 401
        monkeypatch.setattr(agent_main, "PAIRING_EXPIRES_AT", 0)
        renewed = client.get("/health").json()
        assert renewed["pairingCode"]
        assert renewed["pairingCode"] != health["pairingCode"]


def test_health_allows_private_network_preflight_from_public_app():
    with TestClient(agent_main.app) as client:
        response = client.options(
            "/health",
            headers={
                "Origin": "https://bml.jenss.me",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Private-Network": "true",
            },
        )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://bml.jenss.me"
    assert response.headers["access-control-allow-private-network"] == "true"


def test_default_analysis_window_covers_full_video():
    assert agent_main.resolve_frame_window(1800, None, None) == (300, 6, False)
    assert agent_main.resolve_frame_window(1800, 300, 1) == (300, 1, True)
    # Pixel budget bounds high-resolution decode windows (anti-OOM)
    assert agent_main.resolve_frame_window(300, None, None, width=3840, height=2160) == (16, 19, False)
    assert agent_main.resolve_frame_window(1800, None, None, width=1280, height=720) == (145, 13, False)
    # Over-budget frames clamp to a single frame instead of dividing by zero
    assert agent_main.resolve_frame_window(300, None, None, width=22000, height=13000) == (1, 300, False)
    assert agent_main.resolve_frame_window(300, 300, 1, width=22000, height=13000) == (1, 1, True)


def test_analysis_window_obeys_conservative_byte_budget():
    assert agent_main.MAX_ANALYSIS_BYTES <= 384 * 1024 * 1024
    frame_bytes = 1280 * 720 * 3
    expected_frames = agent_main.MAX_ANALYSIS_BYTES // frame_bytes
    assert expected_frames >= 1
    assert agent_main.resolve_frame_window(600, None, None, width=1280, height=720) == (
        expected_frames,
        5,
        False,
    )


def test_register_capture_offloads_media_inspection(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    data.mkdir()
    media_root = tmp_path / "media"
    media_root.mkdir()
    media = media_root / "clip.mp4"
    media.write_bytes(b"test media")
    monkeypatch.setenv("BML_MEDIA_ROOTS", str(media_root))
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", ByokStore(data / "secrets"))
    calls: list[str] = []

    def fake_inspect(path: Path):
        assert path == media.resolve()
        return "a" * 64, {"width": 1280, "height": 720, "fps": 30, "frameCount": 1, "bytes": 10, "durationMs": 33}

    async def fake_to_thread(function, *args, **kwargs):
        calls.append(function.__name__)
        return function(*args, **kwargs)

    monkeypatch.setattr(agent_main, "_inspect_capture_sync", fake_inspect)
    monkeypatch.setattr(agent_main.asyncio, "to_thread", fake_to_thread)

    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        pair = client.post("/pair", json={"pairing_code": health["pairingCode"]})
        response = client.post(
            "/captures/register",
            json={"path": str(media)},
            headers={"Authorization": f"Bearer {pair.json()['token']}"},
        )
        assert response.status_code == 200
    assert calls == ["fake_inspect"]


def test_analyze_maps_memory_exhaustion_to_structured_response(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    data.mkdir()
    media_root = tmp_path / "media"
    media_root.mkdir()
    media = media_root / "clip.mp4"
    media.write_bytes(b"test media")
    metadata = {"width": 1280, "height": 720, "fps": 30, "frameCount": 1, "bytes": 10, "durationMs": 33}
    monkeypatch.setenv("BML_MEDIA_ROOTS", str(media_root))
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", ByokStore(data / "secrets"))
    monkeypatch.setattr(agent_main, "_inspect_capture_sync", lambda _path: ("a" * 64, dict(metadata)))

    def fail_analysis(*_args, **_kwargs):
        raise MemoryError("allocation failed")

    monkeypatch.setattr(agent_main, "_run_analyze_sync", fail_analysis)
    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        token = client.post("/pair", json={"pairing_code": health["pairingCode"]}).json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        capture = client.post("/captures/register", json={"path": str(media)}, headers=headers).json()
        response = client.post("/analyze", json={"capture_id": capture["captureId"]}, headers=headers)
        assert response.status_code == 503
        assert response.json()["detail"]["code"] == "analysis_memory_limit"


def test_agent_host_requires_loopback_without_explicit_opt_in(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("BML_ALLOW_NON_LOOPBACK_HOST", raising=False)
    assert agent_main.validate_agent_host("127.0.0.1") == "127.0.0.1"
    assert agent_main.validate_agent_host("localhost") == "localhost"
    with pytest.raises(RuntimeError, match="loopback"):
        agent_main.validate_agent_host("0.0.0.0")

    monkeypatch.setenv("BML_ALLOW_NON_LOOPBACK_HOST", "1")
    assert agent_main.validate_agent_host("0.0.0.0") == "0.0.0.0"


def test_media_ticket_supports_repeated_playback(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    capture_dir = data / "captures"
    capture_dir.mkdir(parents=True)
    media = capture_dir / "clip.mp4"
    media.write_bytes(b"test media")
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", ByokStore(data / "secrets"))

    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        pair = client.post("/pair", json={"pairing_code": health["pairingCode"]})
        token = pair.json()["token"]
        headers = {"Authorization": f"Bearer {token}"}
        with sqlite3.connect(data / "agent.sqlite3") as db:
            db.execute(
                "INSERT INTO captures (id, path, fingerprint, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
                ("capture-1", str(media), "a" * 64, "{}", "now"),
            )
            db.commit()
        ticket = client.post(
            "/media-tickets", json={"capture_id": "capture-1"}, headers=headers
        ).json()["url"]
        assert client.get(ticket).status_code == 200
        assert client.get(ticket).status_code == 200


def test_media_ticket_rejects_unknown_capture(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    data = tmp_path / "agent-data"
    data.mkdir()
    monkeypatch.setattr(agent_main, "DATA_DIR", data)
    monkeypatch.setattr(agent_main, "byok", ByokStore(data / "secrets"))

    with TestClient(agent_main.app) as client:
        health = client.get("/health").json()
        pair = client.post("/pair", json={"pairing_code": health["pairingCode"]})
        token = pair.json()["token"]
        response = client.post(
            "/media-tickets",
            json={"capture_id": "does-not-exist"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert response.status_code == 404
        with sqlite3.connect(data / "agent.sqlite3") as db:
            assert db.execute("SELECT COUNT(*) FROM media_tickets").fetchone() == (0,)


def test_manual_contact_replaces_model_event_and_reaches_racket_metric():
    pose_frames = [
        {
            "frameIndex": index,
            "timeMs": index * 33.3,
            "landmarks": [
                {"name": "left_wrist", "x": 0.2, "y": 0.3, "confidence": 0.9},
                {"name": "left_elbow", "x": 0.1, "y": 0.4, "confidence": 0.9},
                {"name": "right_wrist", "x": 0.8, "y": 0.3, "confidence": 0.4},
                {"name": "right_elbow", "x": 0.7, "y": 0.4, "confidence": 0.4},
            ],
        }
        for index in range(30)
    ]
    racket = track_racket(pose_frames=pose_frames, fps=30, dominant_hand="left")
    assert racket["points"][0]["x"] < 0.5
    events = propose_events(
        pose_frames=pose_frames,
        racket_track=[
            {"frameIndex": 0, "x": 0.1, "y": 0.2},
            {"frameIndex": 10, "x": 0.9, "y": 0.2},
        ],
        shuttle_track=[],
        fps=30,
        stroke_hint="clear",
        manual_events=[{"type": "contact", "frameIndex": 20, "timeMs": 666.0, "confidence": 1.0}],
    )
    contacts = [event for event in events["events"] if event["type"] == "contact"]
    assert len(contacts) == 1
    assert contacts[0]["frameIndex"] == 20
    assert contacts[0]["source"] == "corrected"
    assert events["reps"][0]["contactFrame"] == 20


def test_manual_event_can_target_unsampled_source_frame():
    pose_frames = [
        {
            "frameIndex": index,
            "timeMs": index * 33.3,
            "landmarks": [],
        }
        for index in range(30)
    ]
    events = propose_events(
        pose_frames=pose_frames,
        racket_track=[{"frameIndex": 0, "x": 0.1, "y": 0.2}],
        shuttle_track=[],
        fps=30,
        stroke_hint="clear",
        manual_events=[{"type": "contact", "frameIndex": 40, "timeMs": 1333.0}],
        source_frame_count=60,
        source_duration_ms=2000.0,
    )
    contact = next(event for event in events["events"] if event["type"] == "contact")
    assert contact["frameIndex"] == 40


def _pose_only_footwork_frames() -> list[dict]:
    return [
        {
            "frameIndex": index,
            "timeMs": index * 33.3,
            "landmarks": [
                {"name": "left_ankle", "x": 0.2 + index * 0.02, "y": 0.8, "confidence": 0.9},
                {"name": "right_ankle", "x": 0.4 + index * 0.02, "y": 0.8, "confidence": 0.9},
            ],
        }
        for index in range(12)
    ]


def test_pure_footwork_proposes_events_without_racket_or_contact():
    events = propose_events(
        pose_frames=_pose_only_footwork_frames(),
        racket_track=[],
        shuttle_track=[],
        fps=30,
        stroke_hint="drill",
        pure_footwork=True,
        source_frame_count=12,
        source_duration_ms=400.0,
    )
    types = {event["type"] for event in events["events"]}
    assert events["mode"] == "auto"
    assert {"split_step", "first_step", "base_return"}.issubset(types)
    assert not any(event["type"] == "contact" for event in events["events"])

    metrics = compute_metrics(
        modules=["footwork:pure"],
        pose={"frames": _pose_only_footwork_frames()},
        racket={},
        shuttle={},
        events=events,
        court={"valid": True, "homography": [[1, 0, 0], [0, 1, 0], [0, 0, 1]]},
        fps=30,
    )
    assert {metric["metricId"] for metric in metrics} >= {
        "split_step_count",
        "first_step_latency",
        "court_coverage_area",
        "path_efficiency",
    }


def test_pure_footwork_ignores_wrist_proxy_track():
    events = propose_events(
        pose_frames=_pose_only_footwork_frames(),
        racket_track=[{"frameIndex": 0, "x": 0.3, "y": 0.4}],
        shuttle_track=[],
        fps=30,
        stroke_hint="drill",
        pure_footwork=True,
        source_frame_count=12,
        source_duration_ms=400.0,
    )

    types = {event["type"] for event in events["events"]}
    assert events["mode"] == "auto"
    assert {"split_step", "first_step", "base_return"}.issubset(types)
    assert "contact" not in types


def test_corrected_contact_outside_sampled_pose_window_is_not_measured():
    metrics = compute_metrics(
        modules=["technique:clear"],
        pose={"frames": _pose_only_footwork_frames()},
        racket={"points": [{"frameIndex": 10, "x": 0.5, "y": 0.5}]},
        shuttle={},
        events={
            "events": [
                {
                    "type": "contact",
                    "frameIndex": 40,
                    "timeMs": 1333.0,
                    "confidence": 1.0,
                    "source": "corrected",
                }
            ]
        },
        court={"valid": False},
        fps=30,
    )
    assert metrics == []


def test_analysis_manifest_matches_contract_step_shape(tmp_path: Path):
    writer = AnalysisPackageWriter(tmp_path / "packages" / "run-1")
    package = writer.write(
        analysis_run_id="run-1",
        capture_id="capture-1",
        fingerprint="a" * 64,
        meta={"width": 1280, "height": 720, "fps": 30, "durationMs": 1000},
        modules=["footwork:pure"],
        quality={"passed": True, "checks": [], "captureProfile": "test"},
        court={"valid": True},
        pose={},
        racket={},
        shuttle={},
        events={},
        metrics=[],
        findings=[],
        stroke_prediction={
            "strokeId": "clear",
            "contactFrame": 12,
            "confidence": 0.8,
            "provenance": {"checkpointSha256": "c" * 64, "publicEvidence": False},
        },
        pipeline_version="0.2.2",
        step_timings={
            "pose": ("2026-01-01T00:00:00+00:00", "2026-01-01T00:00:01+00:00"),
            "quality_gate": ("2026-01-01T00:00:01+00:00", "2026-01-01T00:00:02+00:00"),
        },
        step_input_artifacts={
            "pose": ["sourceMedia"],
            "quality_gate": ["sourceMedia", "pose"],
        },
    )
    assert all(
        {"startedAt", "finishedAt", "inputHashes", "outputHashes"}.issubset(step)
        for step in package["manifest"]["steps"]
    )
    steps = {step["stepId"]: step for step in package["manifest"]["steps"]}
    assert steps["pose"]["startedAt"] != steps["pose"]["finishedAt"]
    assert steps["quality_gate"]["inputHashes"] == [
        "a" * 64,
        steps["pose"]["outputHashes"][0],
    ]
    assert package["manifest"]["artifacts"]["stroke_classifier"]["path"] == "stroke_classifier.json"


def test_analysis_manifest_marks_degraded_shuttle_stage_failed(tmp_path: Path):
    writer = AnalysisPackageWriter(tmp_path / "packages" / "run-shuttle-error")
    package = writer.write(
        analysis_run_id="run-shuttle-error",
        capture_id="capture-1",
        fingerprint="a" * 64,
        meta={"width": 1280, "height": 720, "fps": 30, "durationMs": 1000},
        modules=["technique:clear"],
        quality={"passed": True, "checks": [], "captureProfile": "test"},
        court={"valid": True},
        pose={},
        racket={},
        shuttle={"error": "No shuttle motion blobs detected"},
        events={},
        metrics=[],
        findings=[],
        pipeline_version="0.2.2",
    )
    shuttle_step = next(step for step in package["manifest"]["steps"] if step["stepId"] == "shuttle")
    assert shuttle_step["status"] == "failed"
    assert shuttle_step["error"] == "No shuttle motion blobs detected"


def test_analysis_manifest_rejects_unknown_step_status(tmp_path: Path):
    writer = AnalysisPackageWriter(tmp_path / "packages" / "run-status")
    package = writer.write(
        analysis_run_id="run-status",
        capture_id="capture-1",
        fingerprint="a" * 64,
        meta={"width": 1280, "height": 720, "fps": 30, "durationMs": 1000},
        modules=["technique:clear"],
        quality={"passed": True, "checks": [], "captureProfile": "test"},
        court={"valid": True},
        pose={},
        racket={},
        shuttle={},
        events={},
        metrics=[],
        findings=[],
        pipeline_version="0.2.2",
    )
    package["manifest"]["steps"][0]["status"] = "unknown"
    with pytest.raises(ValueError, match="schema validation failed"):
        validate_analysis_manifest(package["manifest"])
