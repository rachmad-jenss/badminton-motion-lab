from __future__ import annotations

from pathlib import Path

import aiosqlite


def get_db_path(data_dir: Path) -> Path:
    return data_dir / "agent.sqlite3"


async def init_db(db_path: Path) -> None:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    async with aiosqlite.connect(db_path) as db:
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS devices (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              pairing_code TEXT,
              token TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS captures (
              id TEXT PRIMARY KEY,
              path TEXT NOT NULL,
              fingerprint TEXT NOT NULL,
              metadata_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS analysis_runs (
              id TEXT PRIMARY KEY,
              capture_id TEXT NOT NULL,
              package_path TEXT NOT NULL,
              package_sha256 TEXT NOT NULL,
              summary_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            """
        )
        await db.commit()
