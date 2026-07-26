"""Unit tests for auth/path allowlist and BYOK encryption (no MediaPipe)."""

from __future__ import annotations

import os
import sqlite3
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.byok import ByokStore
from adapters.events import propose_events
from adapters.media import MediaError
from adapters.paths import assert_allowed_media_path
from adapters.racket import track_racket
from pipeline.package import AnalysisPackageWriter
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


def test_default_analysis_window_covers_full_video():
    assert agent_main.resolve_frame_window(1800, None, None) == (300, 6, False)
    assert agent_main.resolve_frame_window(1800, 300, 1) == (300, 1, True)


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
        pipeline_version="0.2.2",
    )
    assert all(
        {"startedAt", "finishedAt", "inputHashes", "outputHashes"}.issubset(step)
        for step in package["manifest"]["steps"]
    )
