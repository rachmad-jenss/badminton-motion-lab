# Plan 021: Supabase tenant relationship integrity

## Status

- **Priority**: P0
- **Risk**: HIGH
- **Depends on**: Plans 018-019
- **Finding**: child rows can reference another tenant's parent UUID while RLS checks only the child owner

## Objective

Make database relationships tenant-safe even when an attacker knows a valid
UUID, and add executable authorization assertions for the control plane.

## Scope and steps

1. Read the current control-plane schema and local Supabase conventions. Choose
   the smallest safe enforcement: composite owner/entity foreign keys where
   compatible, otherwise explicit parent-owner `exists` checks or secured RPCs.
2. Add a migration that prevents cross-tenant inserts/updates for sessions,
   captures, jobs, runs, and metrics without breaking legitimate ownership
   flows. Commit: `security: enforce tenant ownership across control plane`.
3. Add SQL authorization tests/assertions for positive same-owner and negative
   cross-owner cases. Commit: `test: cover control plane tenant isolation`.

## Verification

- Migration applies cleanly against the configured Supabase schema or local
  equivalent.
- Positive/negative authorization assertions pass.
- No client-side policy bypass is introduced.
