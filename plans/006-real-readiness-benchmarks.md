# Plan 006: Real readiness benchmarks from agent

## Why
`run-fixture-benchmarks.mjs` hardcodes passing scores — ADR-014 theater.

## Steps
1. Script calls running agent (or in-process) on fixture video; derive MAE/coverage/confidence from package outputs vs fixture truth JSON.
2. Use contracts gate logic (port or duplicate carefully from shared JSON gate file only).
3. `--dry-run` may print without writing seed; default write only if agent available.
4. Update readiness seed from real reports; CI starts agent for this step OR uses committed reports from last real run + fail if synthetic notes present.

## Verify
Reports contain real measured fields; notes must not say “Baseline synthetic adapters”.
