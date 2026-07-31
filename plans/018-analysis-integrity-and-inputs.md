# Plan 018: Analysis integrity and input validation

## Status

- **Priority**: P0
- **Risk**: HIGH
- **Depends on**: Plan 009 foundations; Plan 016 browser coverage
- **Findings**: fabricated shoulder metric; malformed manual input accepted; missing lifecycle coverage

## Objective

Make analysis inputs and derived metrics truthful at the API boundary, then
lock the behavior with focused tests before changing downstream evidence or
storage behavior.

## Scope

- `apps/agent/adapters/metrics_engine.py`
- `apps/agent/adapters/court.py`
- `apps/agent/adapters/events.py`
- `apps/agent/main.py`
- `apps/agent/test_*.py` and focused integration fixtures
- Shared metric contracts only where a version or optionality change is required

## Steps and commits

1. Add regression tests for the current false `shoulder_abduction_contact`
   output and define the fail-safe expectation: compute from actual racket-side
   pose geometry when available, otherwise omit the metric rather than invent a
   value. Commit: `test: pin analysis metric integrity`.
2. Implement the metric geometry/withholding behavior and update its contract
   metadata if required. Commit: `fix: make shoulder metrics evidence-based`.
3. Validate four court corners and manual events at the request boundary:
   finite numeric coordinates, frame bounds, unique/non-collinear/non-
   self-intersecting corners, and bounded event frame/time/type fields. Commit:
   `fix: reject invalid analysis inputs`.
4. Add an end-to-end agent lifecycle test covering registration, analysis,
   persisted run/package metadata, and media authorization using a deterministic
   small fixture or explicit test seam. Commit: `test: cover the agent analysis lifecycle`.

## Verification

- Agent pytest and smoke tests.
- Contracts tests and TypeScript checks.
- API tests assert malformed requests receive 4xx and valid requests retain
  existing behavior.
- No synthetic metric value is accepted as a fallback.

## Stop conditions

- A pose-based metric cannot be computed from available landmarks without a
  documented contract decision; stop before inventing a proxy.
- A lifecycle test needs network services or real user data; add a deterministic
  seam instead of weakening production validation.
