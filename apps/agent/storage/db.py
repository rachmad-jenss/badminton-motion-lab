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
              token TEXT NOT NULL DEFAULT '',
              created_at TEXT NOT NULL,
              token_hash TEXT NOT NULL DEFAULT '',
              expires_at INTEGER NOT NULL DEFAULT 0,
              revoked_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS pairing_challenges (
              id TEXT PRIMARY KEY,
              code_hash TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              used_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS pairing_challenges_active_idx
              ON pairing_challenges(code_hash, expires_at, used_at);
            CREATE TABLE IF NOT EXISTS media_tickets (
              token_hash TEXT PRIMARY KEY,
              capture_id TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              used_at INTEGER
            );
            CREATE INDEX IF NOT EXISTS media_tickets_capture_idx
              ON media_tickets(capture_id, expires_at, used_at);
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
        columns = {
            row[1] async for row in await db.execute("PRAGMA table_info(devices)")
        }
        migrations = {
            "token_hash": "ALTER TABLE devices ADD COLUMN token_hash TEXT NOT NULL DEFAULT ''",
            "expires_at": "ALTER TABLE devices ADD COLUMN expires_at INTEGER NOT NULL DEFAULT 0",
            "revoked_at": "ALTER TABLE devices ADD COLUMN revoked_at INTEGER",
        }
        for name, statement in migrations.items():
            if name not in columns:
                await db.execute(statement)
        await db.execute("CREATE INDEX IF NOT EXISTS devices_token_hash_idx ON devices(token_hash)")
        # Existing pre-hardening rows contained bearer tokens in plaintext.
        # Revoke them rather than migrating the secret into another field.
        await db.execute("UPDATE devices SET token = '', token_hash = '' WHERE token <> ''")
        await db.commit()
