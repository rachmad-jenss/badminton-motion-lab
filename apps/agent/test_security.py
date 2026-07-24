"""Unit tests for auth/path allowlist and BYOK encryption (no MediaPipe)."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from adapters.byok import ByokStore
from adapters.media import MediaError
from adapters.paths import assert_allowed_media_path
import main as agent_main


def test_byok_encrypted_not_plaintext():
    with tempfile.TemporaryDirectory() as tmp:
        store = ByokStore(Path(tmp) / "secrets")
        store.set_key(provider="openai", api_key="sk-test-secret", model="gpt-4o-mini")
        assert store.enc_path.exists()
        assert not store.path.exists()
        raw = store.enc_path.read_bytes()
        assert b"sk-test-secret" not in raw
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
        pair = client.post("/pair", json={"pairing_code": "t", "device_name": "test"})
        assert pair.status_code == 200
        token = pair.json()["token"]
        r = client.post(
            "/analyze",
            json={"capture_id": "missing"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert r.status_code == 404
