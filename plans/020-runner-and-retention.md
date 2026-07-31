# Plan 020: Runner lifecycle and local retention

## Status

- **Priority**: P1
- **Risk**: MEDIUM
- **Depends on**: Plan 018
- **Findings**: stale fixed-port agent process; unbounded local database history

## Objective

Make CI own and clean up exactly the agent process it starts, and bound local
challenge/ticket/capture/run storage with an explicit retention policy.

## Scope and steps

1. Update `.github/workflows/ci.yml` to allocate an isolated port/data path,
   record the started process, health-check its identity, and terminate only
   that process in an `always()` cleanup step. Commit: `ci: isolate and clean up the test agent`.
2. Add storage cleanup for expired challenges/tickets and bounded capture/run
   history, preserving package references required by the configured retention
   window. Add tests for expiry, pruning, and safe repeated cleanup. Commit:
   `fix: bound local analysis retention`.
3. Expose bounded history behavior to callers without deleting evidence still
   covered by retention. Commit: `test: verify local retention policy` if a
   separate test-only change is useful.

## Verification

- Workflow YAML parses and the agent job starts/stops its own process.
- Storage tests pass with deterministic timestamps and temporary data roots.
- Full repository verification and browser tests remain green.
