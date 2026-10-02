# BML Training Model Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a bounded real stroke-classification training path, validated checkpoint/inference contract, Local Agent integration, and fail-closed readiness evidence.

**Architecture:** Python/NumPy owns streaming record ingestion, deterministic split assignment, the small multi-task model, checkpoint loading, and evaluation. JavaScript owns repository/source-policy validation and readiness-report validation. The Local Agent consumes an optional validated checkpoint and exposes its contract-shaped prediction without replacing the current perception/event pipeline.

**Tech Stack:** Python 3.11+ runtime already used by `apps/agent`, NumPy, JSONL/CSV streaming, Node.js 20 built-ins, existing FastAPI/Next.js test commands.

**Spec:** `docs/superpowers/specs/2026-10-02-training-model-integration-design.md`

## Global Constraints

- Keep third-party data, video, extracted frames, checkpoints, and external source checkouts outside Git.
- Read JSONL/CSV incrementally; never load a full match or annotation package into memory.
- Default training batch size is at most 8, source concurrency is 1, and every run has record/line/sequence caps.
- Use BST as training-code provenance and ShuttleSet/ShuttleSet22 as the first data baseline; do not download missing sources.
- Keep `strokeId`, `contactFrame`, `confidence`, and `provenance` in every valid checkpoint prediction.
- Held-out readiness evidence must be `own_capture`; synthetic smoke and third-party test data cannot unlock modules.
- Preserve the user's dirty `apps/web/tsconfig.json` and five screenshot files exactly.
- `npm run verify` must not be described as proof that model training occurred.
- Commit each logical task atomically; push only after final verification; do not create or merge a PR.

## Review Focus

- A missing source root or explicit records file must stop before checkpoint creation; test in Task 1.
- A path outside the registered source root must be rejected; test in Task 1.
- A record larger than the cap or with an overlong sequence must be bounded/rejected without retaining the dataset; test in Task 1.
- A checkpoint with a changed checksum, wrong feature shape, or missing output field must fail load/inference; test in Task 2.
- A synthetic or third-party evaluation report must remain not-ready even when its metrics look good; test in Task 4.

---

### Task 1: Training record reader and contract boundary

**Files:**
- Create: `apps/agent/training/__init__.py`
- Create: `apps/agent/training/records.py`
- Create: `apps/agent/test_training.py`
- Modify: `scripts/training-adapters.mjs`
- Modify: `scripts/training-adapters.test.mjs`

**Interfaces:**
- Produces `RecordSource`, `iter_training_records(...)`, `normalize_training_record(...)`, `stable_split(...)`, `extract_feature_vector(...)`, `BML_STROKE_LABELS`, and `FEATURE_NAMES` for the trainer.
- Extends the JS normalized-record split contract with `test` while keeping `held_out` reserved for `own_capture`.
- Produces `TRAINING_CHECKPOINT_CONTRACT` values for model/checkpoint tasks: `version: 1`, model id `bml-technique-stroke-v1`, feature schema version `1`, and required outputs `strokeId`, `contactFrame`, `confidence`, `provenance`.

- [ ] **Step 1: Write failing Python reader tests.**
  Add tests for deterministic split assignment, JSONL streaming normalization for ShuttleSet22, explicit source-root escape rejection, line/sequence caps, unsupported labels being counted/skipped, and missing source paths producing a structured error before iteration.

- [ ] **Step 2: Run the focused reader tests and observe the expected failure.**
  Run `& .\\apps\\agent\\.venv\\Scripts\\python.exe -m pytest apps/agent/test_training.py -q -p no:cacheprovider`. Expected: import/API failures because `apps/agent/training/records.py` does not yet exist.

- [ ] **Step 3: Implement the minimal bounded reader.**
  Use `csv.DictReader` and a capped `readline()` loop for JSONL; resolve every third-party file below its registry `localRoot`; normalize source aliases and BML stroke labels; assign absent splits from `sha256(seed + sourceId + sampleId)`; retain only one normalized record at a time.

- [ ] **Step 4: Add contract tests before changing the JS adapter.**
  Assert `test` is accepted, third-party `held_out` is still rejected, `own_capture` held-out records carry non-public training provenance, and checkpoint required outputs/version are explicit.

- [ ] **Step 5: Implement the JS contract extension.**
  Keep the five selected source registry keys unchanged, add the explicit `test` split and own-capture record boundary to the adapter module, and export the fixed checkpoint contract metadata without marking any third-party source as public evidence.

- [ ] **Step 6: Run focused Python and Node tests.**
  Expected: all reader/contract tests pass; no dataset root is created and no video is read.

- [ ] **Step 7: Commit Task 1.**
  Commit only the reader, contract, and their tests with `feat: add bounded training record boundary`.

### Task 2: Small model, checkpoint, manifest, evaluation, and smoke CLI

**Files:**
- Create: `apps/agent/training/model.py`
- Create: `apps/agent/training/runner.py`
- Create: `apps/agent/training/cli.py`
- Create: `scripts/run-training.ps1`
- Create: `scripts/run-training-tests.ps1`
- Modify: `apps/agent/test_training.py`
- Modify: `package.json`

**Interfaces:**
- Consumes Task 1's normalized record iterator and feature schema.
- Produces `TrainingConfig`, `run_training(...)`, `load_checkpoint(...)`, `predict_checkpoint(...)`, `validate_prediction(...)`, and JSON `checkpoint.json`, `training-manifest.json`, `evaluation.json` artifacts under ignored `validation/training-derived/`.
- CLI commands are `python -m training.cli smoke` and `python -m training.cli run --source bst --source shuttleset --source shuttleset22 --records shuttleset=<path> --records shuttleset22=<path> [--held-out <own-capture-records>]`, exposed as `npm run training:smoke` and `npm run training:run -- ...`.

- [ ] **Step 1: Write failing model/checkpoint tests.**
  Add tests for a tiny separable fixture: deterministic train/validation/test counts, non-zero loss and changing parameters, checkpoint save/load checksum, required prediction fields, provenance fields, and inference after reload. Add a test that a missing real source root returns a nonzero, descriptive provisioning error and writes no checkpoint.

- [ ] **Step 2: Run the focused model tests and observe the expected failure.**
  Run `& .\\apps\\agent\\.venv\\Scripts\\python.exe -m pytest apps/agent/test_training.py -q -p no:cacheprovider`. Expected: missing `training.model`/`training.runner` imports or missing CLI behavior.

- [ ] **Step 3: Implement the bounded NumPy model.**
  Fit train-only feature mean/std in a first streaming pass; run seeded linear softmax cross-entropy plus normalized contact-frame regression with SGD and batch size capped at 8; evaluate each split in a second streaming pass. Do not materialize all examples or shuffle by retaining the dataset.

- [ ] **Step 4: Implement checkpoint and manifest integrity.**
  Write canonical JSON parameters and feature metadata; hash input files streaming; write manifest before checkpoint; hash checkpoint after writing; validate shapes, classes, contract version, and checksum on load. Store only source IDs, file checksums, split counts, license/media fields, and config—not raw records or media.

- [ ] **Step 5: Implement smoke and real-run CLI paths.**
  Smoke mode creates bounded temporary records in a temporary directory, trains, reloads, predicts, and writes an ignored local run marked `evidenceClass: synthetic_smoke` and `readiness: locked`. Real mode requires explicit source/file mappings, checks source roots first, optionally accepts own-capture held-out records, and fails with missing-path instructions rather than pretending to train.

- [ ] **Step 6: Wire focused test commands.**
  Make `scripts/run-training.ps1` select `apps/agent/.venv/Scripts/python.exe` with a safe fallback; add `training:smoke`, `training:run`, and `test:training`. Add the focused training test to the existing agent test runner or invoke it explicitly from `verify`, without making `verify` run real-data training.

- [ ] **Step 7: Run focused tests and smoke training.**
  Expected: focused tests pass; `npm run training:smoke` reports a real train loop, checkpoint reload, contract-valid inference, and `readiness=locked`. Inspect generated files and confirm they are ignored.

- [ ] **Step 8: Commit Task 2.**
  Commit only trainer/CLI/tests/package command changes with `feat: add bounded stroke checkpoint training`.

### Task 3: Local Agent checkpoint inference integration

**Files:**
- Modify: `apps/agent/main.py`
- Modify: `apps/agent/pipeline/package.py`
- Modify: `apps/agent/test_integrity.py` or `apps/agent/test_security.py`
- Modify: `apps/agent/test_training.py`

**Interfaces:**
- Consumes `load_checkpoint(...)` and `predict_checkpoint(...)` from Task 2.
- Produces an optional summary `strokePrediction` and package artifact `stroke_classifier`; no checkpoint means an explicit disabled marker, not a fabricated prediction.

- [ ] **Step 1: Write failing integration tests.**
  Test that `_run_analyze_sync`-level model input construction produces a contract-shaped prediction with a configured checkpoint, that an unset checkpoint produces `enabled: false`, and that an invalid configured checkpoint fails closed. Test package manifests retain the existing exact pipeline step set while allowing the additional artifact.

- [ ] **Step 2: Run the focused integration tests and observe the expected failure.**
  Expected: no `strokePrediction`/`stroke_classifier` support exists.

- [ ] **Step 3: Add lazy Local Agent integration.**
  When `BML_STROKE_CHECKPOINT` is set, derive the fixed features from the bounded pose/racket/shuttle analysis summaries and return the model contract; otherwise return a disabled status. Keep existing heuristic events, manual corrections, and metrics unchanged.

- [ ] **Step 4: Add package artifact support.**
  Write the prediction or disabled marker as `stroke_classifier` without adding a new required manifest step or changing the existing exact step validation.

- [ ] **Step 5: Run focused and existing agent tests.**
  Expected: all model integration tests pass and the existing 35-test baseline remains green or increases only by the intentional training tests.

- [ ] **Step 6: Commit Task 3.**
  Commit with `feat: consume trained stroke checkpoints in agent`.

### Task 4: Training evaluation validator and readiness gate

**Files:**
- Create: `scripts/check-training-readiness.mjs`
- Create: `scripts/training-readiness.test.mjs`
- Modify: `scripts/run-domain-benchmarks.mjs`
- Modify: `scripts/check-readiness-integrity.mjs`
- Modify: `validation/benchmark-configs/module-matrix.json`
- Modify: `docs/validation/README.md`

**Interfaces:**
- Produces `loadTrainingEvaluation(path) -> { status, ready, errors, report }` with statuses for missing, invalid, not-ready, and ready evidence.
- Domain benchmark evaluation consumes training status for `technique_stroke` and `footwork_layer`; `footwork_pure` remains domain/court gated.

- [ ] **Step 1: Write failing readiness tests.**
  Add tests for missing evaluation, checksum mismatch, synthetic smoke evidence, third-party held-out evidence, and a temporary valid own-capture report/checkpoint whose checksum and required output contract pass.

- [ ] **Step 2: Run readiness tests and observe the expected failure.**
  Expected: missing module/function failures.

- [ ] **Step 3: Implement the local evaluation validator.**
  Validate report version, checkpoint hash, contract outputs, finite split metrics, positive `own_capture` held-out count, non-synthetic evidence class, and explicit metric pass. Resolve only local ignored artifacts and return not-ready instead of throwing for absent maintainer data.

- [ ] **Step 4: Wire domain benchmark reports to training evidence.**
  Pass `moduleEvidence` explicitly into the evaluator, fix the current free-variable path, include training status in reports, and keep `technique:*`/`footwork:layer:*` locked when training evidence is missing or invalid. Add `requiresTrainingEvidence: true` to those two module patterns in `validation/benchmark-configs/module-matrix.json` and `false` for `footwork:pure`.

- [ ] **Step 5: Strengthen readiness integrity tests/checks.**
  Reject any passed report requiring training evidence when the validator says not-ready; preserve the current empty-domain and synthetic-fixture behavior; keep the committed seed locked.

- [ ] **Step 6: Run focused readiness and integrity checks.**
  Expected: positive validator tests pass, `npm run readiness:integrity` remains an honest incomplete state, and no readiness seed module changes to `on`.

- [ ] **Step 7: Commit Task 4.**
  Commit with `feat: gate readiness on trained checkpoint evidence`.

### Task 5: Provisioning documentation and repository verification wiring

**Files:**
- Modify: `docs/training/README.md`
- Modify: `README.md`
- Modify: `package.json`
- Modify: `scripts/run-agent-tests.ps1` if Task 2's focused test is added there
- Create or modify: no dataset/checkpoint files

**Interfaces:**
- Documents exact safe provisioning paths, expected JSONL/CSV mapping, real-run commands, artifact locations, license boundary, and the distinction between `verify`, smoke training, and real-source training.

- [ ] **Step 1: Run documentation and registry checks.**
  Run `rg -n "training:smoke|training:run|readiness=locked|training-derived|own_capture" docs/training/README.md README.md` and `npm run training:sources`. Expected: every command/boundary is documented and all five registry sources validate without local data.

- [ ] **Step 2: Update docs and verify wiring.**
  Include missing-root output/instructions, `own_capture` held-out requirements, and explicit `PASS`/`NOT_RUN` semantics. Keep `npm run verify` free of raw-data requirements while including unit/readiness tests.

- [ ] **Step 3: Run repository-safe verification.**
  Run `npm run training:sources`, focused source/adapter/training/readiness tests, `npm run readiness:integrity`, `npm run typecheck`, `npm run verify`, and `git diff --check`. Expected: repository tests pass; public completeness remains locked; real source training is reported `NOT_RUN` because roots are absent.

- [ ] **Step 4: Commit documentation and verification wiring.**
  Commit with `docs: document real training and readiness evidence`.

### Task 6: Final validation, website smoke, review, and delivery

**Files:**
- Review only: all changes from Tasks 1–5
- Generated only under ignored paths: local smoke checkpoint/manifest/evaluation

- [ ] **Step 1: Run the final smoke training and inspect artifacts.**
  Confirm non-zero training updates, checkpoint checksum, reload inference, required output fields, and `readiness=locked`; confirm no generated artifact is tracked.

- [ ] **Step 2: Run full tests and build checks.**
  Run `npm run test:training`, `npm run test:training-sources`, `npm run test:training-adapters`, `npm run test:agent`, `npm run test:web`, `npm run typecheck`, and `npm run verify`; run `npm run build -w @bml/web` for the static web artifact.

- [ ] **Step 3: Run website smoke in Codex in-app browser.**
  Start `npm run serve:web`, open the local server in the Codex in-app browser, inspect `/`, `/agent`, and `/analyze`, and report browser runtime failure as `NOT_RUN` rather than substituting Playwright.

- [ ] **Step 4: Inspect final diff and Git safety.**
  Verify only intended files are staged, the user’s dirty files are unchanged, no raw dataset/video/frame/checkpoint is tracked, and readiness seed/reports remain fail-closed.

- [ ] **Step 5: Perform final whole-branch review.**
  Use the plan review package and a fresh reviewer if available; otherwise record a separate self-review and re-grade critical/important findings before any fix pass.

- [ ] **Step 6: Push the target branch only after all verification.**
  Push `jenss/training-source-integration` to its existing remote. Do not create or merge a pull request.
