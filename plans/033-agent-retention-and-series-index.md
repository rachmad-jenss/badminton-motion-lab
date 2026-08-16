# Plan 33: Bound agent DB growth and series scans

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. Update the status row in
> `plans/README.md` when done (unless a reviewer maintains the index).
>
> **Drift check (run first)**: `git diff --stat aa1479a..HEAD -- <in-scope paths>`
> If in-scope files changed since this plan was written, compare excerpts against
> live code; on mismatch, STOP.

## Status

- **Priority**: P1 | P2
- **Effort**: S | M
- **Risk**: LOW
- **Depends on**: see body
- **Category**: see body
- **Planned at**: commit `aa1479a`, 2026-08-16

## Why this matters

Local-agent DB retention only runs at startup (`init_db` → `cleanup_storage`), so a
long-running agent session accumulates captures/runs; `/metrics/series` re-parses every
summary per request. This plan adds per-analysis cleanup and a created_at index so
history stays bounded and the Compare page stays fast.

## Current state

- `apps/agent/storage/db.py:212` — `await cleanup_storage(db_path)` at the end of `init_db` (startup only).
- `apps/agent/main.py` `analyze()` (~lines 789-800) inserts an `analysis_runs` row and commits; no cleanup.
- `apps/agent/main.py:806-836` — `/metrics/series` selects runs ordered by `created_at DESC LIMIT ?` (no index).
- `apps/agent/storage/db.py` `init_db` creates tables; no index on `analysis_runs(created_at)`.

## Scope

**In scope**: `apps/agent/main.py`, `apps/agent/storage/db.py`.
**Out of scope**: retention defaults, package pruning (`PACKAGE_RETENTION` already runs per analyze).

## Steps

1. In `main.py`, import `cleanup_storage` from `storage.db` (extend the existing import line).
2. At the end of `analyze()` (after the `analysis_runs` insert + commit, before creating the
   media ticket — or right after the insert block), add:
   ```python
   await cleanup_storage(db_path)
   ```
   The freshly inserted run/capture are newest, so retention keeps them.
3. In `db.py` `init_db` executescript, add:
   ```sql
   CREATE INDEX IF NOT EXISTS analysis_runs_created_idx ON analysis_runs(created_at DESC);
   ```

## Test plan

- `npm.cmd run test:agent` — `test_storage.py` covers `cleanup_storage` (retention assertions) and must pass.
- `npm.cmd run test:security`-style agent suite must pass (part of test:agent).

## Done criteria

- [ ] `python -m py_compile apps/agent/main.py apps/agent/storage/db.py` exits 0
- [ ] `npm.cmd run test:agent` passes
- [ ] `Select-String apps/agent/main.py -Pattern 'cleanup_storage'` shows the import and the call in analyze()
- [ ] `git status --short` shows only `apps/agent/main.py` and `apps/agent/storage/db.py` modified

## STOP conditions

- `cleanup_storage` signature drift (it is async and accepts optional retention args; keep default call).
- Tests reveal a retention regression (a run newer than the retention window being deleted).

## Maintenance notes

- Each analyze now does a small bounded cleanup; cost is negligible for local single-user use.
- If cloud sync later reads runs, revisit retention policy; DB rows are metadata only (no media).
