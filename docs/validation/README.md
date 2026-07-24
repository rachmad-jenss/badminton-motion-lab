# Validation & benchmarks

- `fixtures/` — synthetic capture metadata used by `npm run benchmark:fixtures`
- `benchmark-configs/default-gate.json` — shared readiness gate
- `reports/` — per-module benchmark reports (`passed` flips `locked` → `on`)

Public build requires every module report `passed: true` (see `npm run readiness:check`).
