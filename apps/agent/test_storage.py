"""Focused tests for local agent storage retention."""

from __future__ import annotations

import asyncio
import sqlite3
from pathlib import Path

from storage.db import cleanup_storage, init_db


def _run(coro):
    return asyncio.run(coro)


def _insert_fixture_rows(db_path: Path) -> None:
    with sqlite3.connect(db_path) as db:
        db.executemany(
            "INSERT INTO pairing_challenges (id, code_hash, expires_at, used_at) VALUES (?, ?, ?, ?)",
            [("challenge-expired", "expired", 99, None), ("challenge-live", "live", 101, None)],
        )
        db.executemany(
            "INSERT INTO media_tickets (token_hash, capture_id, expires_at, used_at) VALUES (?, ?, ?, ?)",
            [("ticket-expired", "capture-stale", 99, None), ("ticket-live", "capture-newest", 101, None)],
        )
        db.executemany(
            "INSERT INTO captures (id, path, fingerprint, metadata_json, created_at) VALUES (?, ?, ?, ?, ?)",
            [
                ("capture-stale", "stale.mp4", "a" * 64, "{}", "2026-01-01T00:00:00+00:00"),
                ("capture-referenced", "referenced.mp4", "b" * 64, "{}", "2026-01-02T00:00:00+00:00"),
                ("capture-newest", "newest.mp4", "c" * 64, "{}", "2026-01-03T00:00:00+00:00"),
            ],
        )
        db.executemany(
            """INSERT INTO analysis_runs
               (id, capture_id, package_path, package_sha256, summary_json, created_at)
               VALUES (?, ?, ?, ?, ?, ?)""",
            [
                (
                    "run-old",
                    "capture-stale",
                    "packages/run-old",
                    "d" * 64,
                    "{}",
                    "2026-01-01T00:00:00+00:00",
                ),
                (
                    "run-retained",
                    "capture-referenced",
                    "packages/run-retained",
                    "e" * 64,
                    "{}",
                    "2026-01-02T00:00:00+00:00",
                ),
                (
                    "run-newest",
                    "capture-newest",
                    "packages/run-newest",
                    "f" * 64,
                    "{}",
                    "2026-01-03T00:00:00+00:00",
                ),
            ],
        )
        db.commit()


def test_cleanup_expires_rows_and_preserves_retained_evidence(tmp_path: Path):
    db_path = tmp_path / "agent.sqlite3"
    _run(init_db(db_path))
    _insert_fixture_rows(db_path)
    package = tmp_path / "packages" / "run-retained"
    package.mkdir(parents=True)
    (package / ".complete").write_text("retained", encoding="utf-8")

    deleted = _run(
        cleanup_storage(
            db_path,
            now=100,
            capture_retention=1,
            analysis_retention=2,
        )
    )

    assert deleted == {
        "pairing_challenges": 1,
        "media_tickets": 1,
        "analysis_runs": 1,
        "captures": 1,
        "media_files": 0,
    }
    with sqlite3.connect(db_path) as db:
        assert db.execute("SELECT id FROM pairing_challenges").fetchall() == [("challenge-live",)]
        assert db.execute("SELECT token_hash FROM media_tickets").fetchall() == [("ticket-live",)]
        assert db.execute("SELECT id FROM analysis_runs ORDER BY id").fetchall() == [
            ("run-newest",),
            ("run-retained",),
        ]
        assert db.execute("SELECT id FROM captures ORDER BY id").fetchall() == [
            ("capture-newest",),
            ("capture-referenced",),
        ]
    assert package.joinpath(".complete").read_text(encoding="utf-8") == "retained"


def test_cleanup_is_idempotent_and_rejects_empty_retention(tmp_path: Path):
    db_path = tmp_path / "agent.sqlite3"
    _run(init_db(db_path))
    _insert_fixture_rows(db_path)

    _run(cleanup_storage(db_path, now=100, capture_retention=1, analysis_retention=2))
    assert _run(cleanup_storage(db_path, now=100, capture_retention=1, analysis_retention=2)) == {
        "pairing_challenges": 0,
        "media_tickets": 0,
        "analysis_runs": 0,
        "captures": 0,
        "media_files": 0,
    }

    try:
        _run(cleanup_storage(db_path, capture_retention=0))
    except ValueError as error:
        assert str(error) == "retention limits must be at least 1"
    else:
        raise AssertionError("empty retention should be rejected")
