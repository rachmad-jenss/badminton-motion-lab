from __future__ import annotations

import os
import time
from pathlib import Path

import aiosqlite

from adapters.media import MediaError
from adapters.paths import assert_allowed_media_path


def get_db_path(data_dir: Path) -> Path:
    return data_dir / "agent.sqlite3"


def _retention_limit(name: str, fallback: int = 100) -> int:
    raw = os.getenv(name)
    if raw in (None, ""):
        return fallback
    try:
        value = int(raw)
    except ValueError:
        return fallback
    return max(1, value)


async def cleanup_storage(
    db_path: Path,
    *,
    now: int | None = None,
    capture_retention: int | None = None,
    analysis_retention: int | None = None,
) -> dict[str, int]:
    """Expire transient rows and bound local history without deleting evidence.

    Analysis runs retained by ``analysis_retention`` keep their capture rows,
    even when those captures are older than ``capture_retention``. This
    routine prunes transient metadata and deletes only explicitly agent-owned
    capture copies under the agent data directory. Registered source media is
    never treated as owned by the agent.
    """
    now = int(time.time()) if now is None else now
    capture_retention = (
        _retention_limit("BML_CAPTURE_RETENTION")
        if capture_retention is None
        else capture_retention
    )
    analysis_retention = (
        _retention_limit("BML_ANALYSIS_RETENTION")
        if analysis_retention is None
        else analysis_retention
    )
    if capture_retention < 1 or analysis_retention < 1:
        raise ValueError("retention limits must be at least 1")

    deleted = {
        "pairing_challenges": 0,
        "media_tickets": 0,
        "analysis_runs": 0,
        "captures": 0,
        "media_files": 0,
    }
    async with aiosqlite.connect(db_path) as db:
        cur = await db.execute(
            """DELETE FROM pairing_challenges
               WHERE expires_at <= ? OR used_at IS NOT NULL""",
            (now,),
        )
        deleted["pairing_challenges"] = max(cur.rowcount, 0)

        cur = await db.execute(
            """DELETE FROM media_tickets
               WHERE expires_at <= ? OR used_at IS NOT NULL""",
            (now,),
        )
        deleted["media_tickets"] = max(cur.rowcount, 0)

        cur = await db.execute(
            """SELECT id, capture_id FROM analysis_runs
               ORDER BY created_at DESC, id DESC"""
        )
        run_rows = await cur.fetchall()
        retained_runs = run_rows[:analysis_retention]
        stale_run_ids = [row[0] for row in run_rows[analysis_retention:]]
        if stale_run_ids:
            placeholders = ", ".join("?" for _ in stale_run_ids)
            cur = await db.execute(
                f"DELETE FROM analysis_runs WHERE id IN ({placeholders})",
                stale_run_ids,
            )
            deleted["analysis_runs"] = max(cur.rowcount, 0)

        cur = await db.execute(
            """SELECT id, path, owned FROM captures ORDER BY created_at DESC, id DESC"""
        )
        capture_rows = await cur.fetchall()
        retained_capture_ids = {row[0] for row in capture_rows[:capture_retention]}
        retained_capture_ids.update(row[1] for row in retained_runs)
        stale_capture_ids = [
            row[0] for row in capture_rows if row[0] not in retained_capture_ids
        ]
        if stale_capture_ids:
            placeholders = ", ".join("?" for _ in stale_capture_ids)
            cur = await db.execute(
                f"DELETE FROM media_tickets WHERE capture_id IN ({placeholders})",
                stale_capture_ids,
            )
            deleted["media_tickets"] += max(cur.rowcount, 0)
            cur = await db.execute(
                f"DELETE FROM captures WHERE id IN ({placeholders})",
                stale_capture_ids,
            )
            deleted["captures"] = max(cur.rowcount, 0)
            agent_captures = (db_path.parent / "captures").resolve()
            for capture_id, capture_path, owned in capture_rows:
                if capture_id not in stale_capture_ids or not owned:
                    continue
                try:
                    allowed_path = Path(capture_path).resolve()
                    allowed_path.relative_to(agent_captures)
                    allowed_path = assert_allowed_media_path(allowed_path, data_dir=db_path.parent)
                except (MediaError, OSError):
                    continue
                try:
                    allowed_path.unlink()
                except OSError:
                    continue
                deleted["media_files"] += 1

        cur = await db.execute(
            """DELETE FROM media_tickets
               WHERE NOT EXISTS (
                 SELECT 1 FROM captures WHERE captures.id = media_tickets.capture_id
               )"""
        )
        deleted["media_tickets"] += max(cur.rowcount, 0)
        await db.commit()
    return deleted


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
              created_at TEXT NOT NULL,
              owned INTEGER NOT NULL DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS analysis_runs (
              id TEXT PRIMARY KEY,
              capture_id TEXT NOT NULL,
              package_path TEXT NOT NULL,
              package_sha256 TEXT NOT NULL,
              summary_json TEXT NOT NULL,
              created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS analysis_runs_created_idx
              ON analysis_runs(created_at DESC);
            """
        )
        capture_columns = {
            row[1] async for row in await db.execute("PRAGMA table_info(captures)")
        }
        if "owned" not in capture_columns:
            await db.execute("ALTER TABLE captures ADD COLUMN owned INTEGER NOT NULL DEFAULT 0")
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
    await cleanup_storage(db_path)
