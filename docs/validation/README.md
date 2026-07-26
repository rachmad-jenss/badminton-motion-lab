# Validation & benchmarks

- `fixtures/` — real-media smoke fixtures and per-fixture truth metadata used by `npm run benchmark:fixtures`
- `benchmark-configs/default-gate.json` — shared readiness gate
- `reports/` — per-module benchmark reports (`passed` flips `locked` → `on`)

Public build requires every module report `passed: true` and domain badminton fixtures (see `npm run readiness:check`). CI validates provenance with `npm run readiness:integrity`; an incomplete readiness state remains visible and is never promoted to public completeness. `infra/windows/package-agent.cmd` builds the portable developer bundle; signing/MSI wrapping is a release concern.
