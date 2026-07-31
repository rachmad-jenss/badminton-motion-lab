# Plan 019: Provenance, manifest validation, and BYOK output safety

## Status

- **Priority**: P0
- **Risk**: HIGH
- **Depends on**: Plan 018
- **Findings**: stale capture fingerprint; unvalidated manifest; untrusted BYOK output

## Objective

Ensure every analysis package describes the bytes actually analyzed, conforms to
the runtime manifest schema, and never presents unvalidated remote text as a
truthful structured analysis.

## Scope and steps

1. Add a test that mutates/replaces a registered capture before analysis and
   assert the request is rejected or explicitly re-registered. Re-probe the
   file immediately before analysis. Commit: `test: cover capture provenance drift`.
2. Implement provenance revalidation and clear error semantics without
   mutating the stored registration silently. Commit: `fix: verify capture provenance before analysis`.
3. Validate generated manifests against the checked-in JSON schema and assert
   required step keys, schema version, and provenance fields. Commit:
   `test: enforce analysis manifest shape` and `fix: validate analysis manifests`.
4. Add mocked-provider tests for valid, malformed, unknown-metric, fabricated,
   and contradictory BYOK responses. Parse/validate the response against the
   allowed contract and mark uncertainty or reject it rather than hard-coding a
   false `fabricatedMetricsAttempted: false`. Commit: `fix: validate BYOK analysis output`.

## Verification

- Agent pytest, contract tests, manifest validation tests, and no-synthetic
  checks.
- Package artifacts produced by the lifecycle test validate against the schema.
- Provider failures remain safe and do not create a misleading report.
