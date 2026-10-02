# Training Source Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make BML explicitly ready to use BFMD, BST, ShuttleSet/ShuttleSet22, and RacketVision as local training sources while publishing the BML code under MIT without redistributing restricted media.

**Architecture:** Add a machine-readable training-source registry that separates repository/code license from dataset/media policy. Add a small Node validator and tests that fail closed on missing sources, path escapes, unknown licenses, or restricted sources marked as public evidence. Keep actual datasets and external checkouts outside Git; this change wires the contracts and repeatable validation, not a multi-gigabyte download or model training run.

**Tech Stack:** Node.js 20 built-ins, JSON, Markdown, existing npm verification pipeline.

**Spec:** `docs/validation/training-source-research-2026-10-02.md`

## Global Constraints

- Keep third-party media, model checkpoints, and external source checkouts out of Git.
- Keep public readiness evidence separate from training data; restricted broadcast datasets cannot unlock public readiness.
- Validate source roots under `validation/training-sources/` and never accept path traversal.
- Keep validation serial and metadata-only; do not load videos or multi-gigabyte annotation packages.
- Preserve the five existing untracked screenshots and the existing research note.
- Add a top-level MIT license for BML code; retain separate third-party attribution and data-rights notices.

## Review Focus

- A source registry with a typo or missing required source must fail before training is attempted.
- A local root such as `../../outside` must be rejected rather than accepted as a dataset path.
- A non-redistributable source must never be marked `publicEvidence: true`.
- Code MIT and data/media rights must remain separate fields.
- An empty local source directory should still allow metadata validation without downloading or parsing media.

---

### Task 1: License, registry, and usage policy

**Files:**
- Create: `LICENSE`
- Create: `validation/training-sources.json`
- Modify: `.gitignore`
- Modify: `README.md`
- Modify: `validation/DATASET_ATTRIBUTION.md`
- Create: `docs/training/README.md`

**Interfaces:**
- Produces the source IDs `bfmd`, `bst`, `shuttleset`, `shuttleset22`, and `racketvision`.
- Each registry entry exposes `repositoryUrl`, `adapter`, `roles`, `codeLicense`, `dataLicense`, `mediaPolicy`, `publicEvidence`, and a local root below `validation/training-sources/`.

- [ ] **Step 1: Add the MIT license** with the repository copyright holder and standard MIT terms.
- [ ] **Step 2: Add the registry** with the five selected sources, explicit code/data license fields, restricted-media policies, and serial/OOM-safe policy values.
- [ ] **Step 3: Ignore local source roots** without ignoring the committed registry or documentation.
- [ ] **Step 4: Document acquisition and attribution** without embedding third-party video or weights.
- [ ] **Step 5: Verify the registry is valid JSON and the existing untracked files remain untouched.**

### Task 2: Source manifest validator

**Files:**
- Create: `scripts/check-training-sources.mjs`
- Create: `scripts/training-sources.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Produces `validateTrainingSourceManifest(manifest)` returning `{ errors, sources }`.
- CLI command `npm run training:sources` validates `validation/training-sources.json` and prints the selected IDs without touching local media.

- [ ] **Step 1: Write failing tests** for valid selected sources, missing source, path traversal, and restricted public evidence.
- [ ] **Step 2: Run `node --test scripts/training-sources.test.mjs` and observe the expected missing-module failure.**
- [ ] **Step 3: Implement the minimal validator** using only Node built-ins and canonical path checks under the allowed local root.
- [ ] **Step 4: Run the focused tests and observe all pass.**
- [ ] **Step 5: Add `training:sources` and `test:training-sources` npm scripts.**

### Task 3: Verification wiring

**Files:**
- Modify: `package.json`
- Modify: `README.md` if the command list needs a final pointer

- [ ] **Step 1: Add `npm run training:sources` and `npm run test:training-sources` to the normal verification path.**
- [ ] **Step 2: Run `npm run training:sources`.**
- [ ] **Step 3: Run `npm run test:training-sources`.**
- [ ] **Step 4: Run the existing targeted checks (`npm run lint`, `npm run typecheck`, and `npm run readiness:integrity`) without downloading datasets.**

### Task 3a: Source adapter and checkpoint contract

**Files:**
- Create: `scripts/training-adapters.mjs`
- Create: `scripts/training-adapters.test.mjs`
- Modify: `scripts/check-training-sources.mjs`
- Modify: `scripts/check-readiness-integrity.mjs`
- Modify: `docs/training/README.md`

**Interfaces:**
- `normalizeTrainingRecord(sourceId, rawRecord, options)` returns a bounded
  `bml-training-record-v1` record with provenance and a train/validation split.
- `TRAINING_CHECKPOINT_CONTRACT` defines required outputs and reserves held-out
  evaluation for own-capture data.

- [ ] **Step 1: Write and run failing adapter tests** for all selected sources,
  held-out rejection, and checkpoint outputs.
- [ ] **Step 2: Implement source-specific normalization** without reading video
  or loading a full dataset.
- [ ] **Step 3: Make the source validator fail closed** for unknown license,
  media-policy, and adapter values.
- [ ] **Step 4: Make readiness integrity reuse the same source-policy validator.**
- [ ] **Step 5: Run adapter, source, and readiness tests.**

### Task 4: Final review and handoff

**Files:**
- Review only: all files changed by Tasks 1–3

- [ ] **Step 1: Run `git diff --check` and inspect the complete diff.**
- [ ] **Step 2: Run the full bounded project verification command.**
- [ ] **Step 3: Confirm no media/checkpoint files entered Git and the public readiness gate remains honest.**
- [ ] **Step 4: Record any remaining limitation: actual model training still requires the user to provision each source locally under its terms.**

## Execution ledger

- **Ruling:** expand the registry-only implementation with source-specific
  record adapters, an input/checkpoint contract, and shared readiness validation
  after final review found those requirements partial — the user asked to use
  the selected projects, and the cost is a small metadata/normalization layer;
  no dataset download or model training is introduced.
