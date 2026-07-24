# ADR-014 — Module Readiness Parity Gate

## Status
Accepted (grilled 2026-07-23)

## Decision
Every Technique stroke, Footwork pure, and Footwork layer module starts `locked`. It flips to `on` only after its own benchmark report passes the shared gate (contact MAE, proposal confidence, racket/shuttle coverage, court validity where required). Private UI shows all modules locked; public stranger build requires zero locked modules.

## Consequences
- Fixture benchmark harness is part of the product
- Incomplete detectors must not silently ship as `on`
