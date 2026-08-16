# Plan 040: Replace deprecated FastAPI on_event startup with lifespan

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If anything in the
> "STOP conditions" section occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 0046446..HEAD -- apps/agent/main.py apps/agent/test_security.py`

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `0046446`, 2026-08-17

## Why this matters

`apps/agent/main.py:252` uses `@app.on_event("startup")`, which FastAPI
deprecates (every pytest run emits `DeprecationWarning`). It will be removed in
a future FastAPI major, breaking agent startup. The lifespan pattern is the
supported replacement and is behavior-identical for this app.

## Current state

- `apps/agent/main.py:251-258`:
  ```python
  @app.on_event("startup")
  async def startup() -> None:
      DATA_DIR.mkdir(parents=True, exist_ok=True)
      (DATA_DIR / "captures").mkdir(exist_ok=True)
      (DATA_DIR / "packages").mkdir(exist_ok=True)
      await init_db(get_db_path(DATA_DIR))
      byok.ensure()
      await rotate_pairing_challenge()
  ```
- `app = FastAPI(title="BML Local Agent", version=AGENT_VERSION)` at
  `main.py:88` — constructed before the startup handler.
- Tests use `with TestClient(agent_main.app) as client:` which runs lifespan
  on enter (test_security.py:80, test_integrity.py:170).

## Scope

**In scope**: `apps/agent/main.py` only.

**Out of scope**: any other endpoint, storage code, or test file.

## Steps

### Step 1: Add the lifespan context manager

- Import: `from contextlib import asynccontextmanager`.
- Define above `app = FastAPI(...)`:
  ```python
  @asynccontextmanager
  async def lifespan(_app: FastAPI):
      DATA_DIR.mkdir(parents=True, exist_ok=True)
      (DATA_DIR / "captures").mkdir(exist_ok=True)
      (DATA_DIR / "packages").mkdir(exist_ok=True)
      await init_db(get_db_path(DATA_DIR))
      byok.ensure()
      await rotate_pairing_challenge()
      yield
  ```
- Change the constructor to `FastAPI(title="BML Local Agent", version=AGENT_VERSION, lifespan=lifespan)`.
- Delete the `@app.on_event("startup")` block.

**Verify**: `Select-String 'on_event' apps\agent\main.py` → no match.

### Step 2: Run the agent test suite

From `apps/agent`: `.venv\Scripts\python.exe -m pytest test_security.py test_integrity.py test_storage.py -q -p no:cacheprovider`.

**Verify**: 23 passed, and the warnings summary no longer contains
`on_event is deprecated`.

## Test plan

- The existing 23 tests are the coverage (they exercise startup via
  `TestClient` and the pairing/analyze lifecycle).
- No new tests needed; the deprecation warning absence is the check.

## Done criteria

- [ ] `Select-String 'on_event' apps\agent\main.py` → no matches
- [ ] pytest: 23 passed, zero `on_event` DeprecationWarnings
- [ ] `plans/README.md` status row updated

## STOP conditions

- If any test fails on startup ordering (e.g., `byok` or `DATA_DIR` not yet
  patched when lifespan runs), stop and report — do not move startup logic
  into endpoint handlers.
- Do not add shutdown logic in this plan (none exists today; `yield` with no
  teardown body is correct).

## Maintenance notes

- `TestClient` runs lifespan only inside `with`; any future test using
  `TestClient(app)` without the context manager would skip startup — keep the
  `with` convention.
- When uvicorn's `startup`/`shutdown` events are removed upstream, this file
  is already migrated.
