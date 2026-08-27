# Plan 056: Bind agent credentials to a safe local agent boundary

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat d6066d2..HEAD -- apps/web/src/lib/agent.ts apps/web/src/app/agent/page.tsx apps/web/tests/ui.spec.ts apps/agent/main.py apps/agent/storage/db.py apps/agent/test_security.py`

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `d6066d2`, 2026-08-27

## Why this matters

The web client currently stores one global bearer token and continues sending it after the user changes the agent URL. A stale token can therefore cross an agent-instance boundary. The agent also permits a non-loopback bind without an explicit unsafe opt-in, while exposing a pairing code on the public health route. This plan scopes credentials to the selected URL, keeps the default agent local-only, and gives users a deliberate way to revoke/forget pairing.

## Current state

- `apps/web/src/lib/agent.ts:61-84` reads `bml.agentToken` and attaches it to every request made against `agentBaseUrl()`.
- `apps/web/src/app/agent/page.tsx:188-205` resets health and pairing-code UI on URL changes but does not revoke or clear the prior token.
- `apps/agent/main.py:42-43,930-933` accepts `BML_AGENT_HOST` and passes it directly to Uvicorn; `/health` is public and returns the live pairing code.
- `apps/agent/storage/db.py:64-139` cleans pairing challenges, tickets, captures, and runs, but never removes expired/revoked device rows.

The existing tests use `apps/web/tests/ui.spec.ts` for browser storage/pairing behavior and `apps/agent/test_security.py` with FastAPI `TestClient` for auth. Match those patterns and never place token values in logs or committed documentation.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Web typecheck | `npm.cmd run typecheck` | exit 0 |
| Agent tests | `npm.cmd run test:agent` | all tests pass |
| Focused agent tests | `apps/agent/.venv/Scripts/python.exe -m pytest apps/agent/test_security.py -q` | all selected tests pass |
| Web browser contract | `npm.cmd run test:web` | all browser assertions pass when Chromium can launch |

## Scope

**In scope**:

- `apps/web/src/lib/agent.ts`
- `apps/web/src/app/agent/page.tsx`
- `apps/web/tests/ui.spec.ts`
- `apps/agent/main.py`
- `apps/agent/storage/db.py`
- `apps/agent/test_security.py`

**Out of scope**:

- Any Supabase/cloud auth change; the local agent is intentionally local-first.
- Printing, persisting, or exposing raw tokens beyond the existing pairing response.
- Allowing non-loopback binds by default.

## Git workflow

- Work on branch `jenss/improve-all-findings`.
- Make one atomic commit for this plan after its focused tests pass: `fix(agent): scope pairing credentials to local agent`.
- Stage only the files listed in Scope; preserve unrelated untracked screenshots.

## Steps

### Step 1: Add failing credential-boundary tests

Update `apps/web/tests/ui.spec.ts` storage helpers to use the scoped key produced by the client (or an exact equivalent test fixture), then add a test that pairs/loads with the default URL, changes the URL, and asserts the UI reports pairing required and no request to the new URL carries the old `Authorization` header. Add agent tests for accepted loopback host values, rejected non-loopback values without the explicit opt-in, and cleanup of expired/revoked devices.

**Verify**: run the focused tests and observe the new assertions fail against the current global-token/host behavior; failures must be assertion failures, not test-loader errors.

### Step 2: Scope browser tokens to normalized agent URLs

In `apps/web/src/lib/agent.ts`, add a small normalization helper and use a storage key derived from the full normalized agent base URL. Export `clearAgentToken(baseUrl?: string)` for the setup page. `agentToken`, `setAgentToken`, and `authHeaders` must all use the same current URL key. Do not fall back to the legacy global token; clear it when forgetting pairing so an old credential cannot cross URLs.

In `apps/web/src/app/agent/page.tsx`, clear the previous URL's token, reset `paired` to false, and require a fresh pair whenever the URL changes. Add a `Forget browser pairing` action that calls `/auth/revoke` when possible, always clears the local scoped token, and reports the result without exposing the token.

**Verify**: rerun the focused browser contract; the URL-switch test must pass and the request log must show no bearer header on the new URL.

### Step 3: Enforce loopback binding and device retention

In `apps/agent/main.py`, add a pure host-validation helper accepting `127.0.0.1`, `::1`, and `localhost`. Reject other binds at import/startup unless `BML_ALLOW_NON_LOOPBACK_HOST=1` is explicitly set, and emit a warning when that unsafe opt-in is used. Keep CORS unchanged. In `apps/agent/storage/db.py`, delete expired or revoked rows from `devices` during the existing bounded cleanup pass. Keep `/auth/revoke` behavior unchanged for the current bearer.

**Verify**: run the focused agent tests and then `npm.cmd run test:agent`; host tests must cover both the safe default and explicit opt-in.

### Step 4: Update plan status and commit

Update the `056` row in `plans/README.md` to `DONE` only after all tests in this plan pass. Run `git diff --check`, inspect `git diff --stat`, and commit only the scoped changes.

**Verify**: `git diff --check` exits 0 and `git show --stat --oneline HEAD` lists only the scoped files.

## Test plan

- Browser regression: URL changes clear the old scoped token, pairing is required again, and the next URL receives no old authorization header.
- Agent security: loopback host validation, explicit unsafe opt-in, expired/revoked device cleanup, and existing pair/revoke flow.
- Existing suite: `npm.cmd run test:agent` and `npm.cmd run typecheck`.

## Done criteria

- [ ] No client request uses a token stored under a different agent URL.
- [ ] Non-loopback host startup fails unless explicitly opted in.
- [ ] Expired/revoked device rows are removed by bounded cleanup.
- [ ] Focused browser and agent regressions pass.
- [ ] `git diff --check` exits 0 and only scoped files are committed.

## STOP conditions

- The current storage or auth call sites differ materially from the excerpts.
- A fix would require sending token material to a server-side logging or analytics system.
- The host guard would prevent the documented loopback installer flow.
- Any focused test fails twice after a reasonable correction.

## Maintenance notes

Any future multi-agent UI must call the same URL-scoped token helpers. If remote-agent support is ever added, it needs a separately reviewed authentication and pairing design; do not weaken this default guard to enable it.
