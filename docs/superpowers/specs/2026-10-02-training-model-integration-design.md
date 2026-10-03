# BML Training Model Integration Design

**Date:** 2026-10-02
**Branch:** `jenss/training-source-integration`

## Goal

Add a real, bounded stroke-classification training path that can produce a
validated checkpoint and use that checkpoint in the BML Local Agent, while
keeping third-party data and weights outside Git and keeping public readiness
fail-closed until the required own-capture evidence exists.

## Current evidence and constraints

- The selected source registry and source adapters already exist.
- The five registered local roots are currently absent:
  `bfmd`, `bst`, `shuttleset`, `shuttleset22`, and `racketvision`.
- Existing metadata, adapter, and agent tests pass, but they do not prove that
  a model has been trained.
- The committed readiness seed is intentionally locked and the domain manifest
  is empty. Synthetic or non-domain fixtures must not unlock public modules.
- Existing local changes in `apps/web/tsconfig.json` and five screenshot files
  are unrelated and must remain untouched.

## Selected approach

Use a small NumPy implementation in the existing Python Local Agent runtime.
The baseline is a deterministic one-hidden-layer ReLU classifier for BML's
stroke taxonomy plus a small linear contact-frame regressor. It is intentionally
not a full BST Transformer replacement: the first milestone proves the complete
source-to-checkpoint-to-inference-to-readiness path under the repository's
memory constraints.

The trainer uses the BST checkout as training-code provenance and consumes
ShuttleSet/ShuttleSet22 records through the existing BML normalization boundary.
It accepts explicit `source=records-file` mappings rather than guessing the
layout of an upstream checkout. This keeps provisioning rights and format
conversion visible and prevents accidental traversal of a large source tree.

## Data boundary and bounded reader

Create `apps/agent/training/records.py` with these rules:

- Read JSONL or CSV incrementally; never load a full match, annotation file, or
  extracted-frame directory into memory.
- Require explicit source/file mappings for third-party data. Each third-party
  file must resolve below its registry `localRoot`; own-capture held-out records
  must resolve below the gitignored domain-media area.
- Enforce configurable caps: maximum record bytes, maximum sequence items,
  maximum records per run, and one active source reader. The default batch size
  is at most 8 and concurrency is 1.
- Normalize source fields into `bml-training-record-v1`, preserving
  `sourceId`, `strokeId`, `contactFrame`, split, and license/media provenance.
- Accept `train`, `validation`, and `test` source splits. If a source record has
  no split, assign one with a SHA-256 of `seed + sourceId + sampleId`; the same
  record therefore always lands in the same split. `held_out` is reserved for
  `own_capture`.
- Map only the BML stroke taxonomy. Unsupported upstream labels are counted in
  the run manifest and cannot silently become a different stroke.

The trainer must fail before training when required source roots, explicit
record files, labels, or provenance are missing. The failure must list each
missing path and the provisioning instruction; it must not create a successful
checkpoint.

## Model, checkpoint, and evaluation

Create `apps/agent/training/model.py` and `runner.py`:

- Use a fixed, documented numeric feature vector derived from normalized
  player/opponent/landing positions, pose/shuttle/racket summaries, FPS, and
  bounded sequence span/counts. Labels and contact frame must never be input
  features.
- Fit training-only feature normalization in a streaming first pass.
- Train softmax cross-entropy and contact-frame regression with seeded NumPy
  SGD, a configured learning rate, loss weights, epoch count, and batch cap.
- Record per-epoch loss, stroke accuracy, contact-frame MAE, confidence, and
  counts for train/validation/test. Evaluation must be a second streaming pass.
- Save only a small JSON checkpoint under ignored
  `validation/training-derived/`. The checkpoint contains model parameters,
  feature schema/version, class labels, optimizer/config, source IDs, and
  provenance; it contains no raw records, video, or extracted frames.
- Write a separate training manifest with input/config SHA-256 values and a
  checkpoint checksum. Write an evaluation report with the output-contract
  validation result and aggregate metrics.

The checkpoint output contract is:

```text
strokeId, contactFrame, confidence, provenance
```

`provenance` includes checkpoint checksum, training-manifest checksum, source
IDs, code/data/media policy, and `publicEvidence: false`. The JS
`TRAINING_CHECKPOINT_CONTRACT` and Python loader must agree on contract version,
required outputs, and the own-capture held-out rule.

## Local Agent integration

Create a lazy checkpoint loader/inference function in the training package and
wire `_run_analyze_sync` to it only when `BML_STROKE_CHECKPOINT` is set.

- A valid checkpoint adds a contract-shaped `strokePrediction` to the analysis
  summary and a `stroke_classifier` package artifact.
- An unset checkpoint produces an explicit disabled marker; it must not claim a
  model prediction or change current heuristic behavior.
- A configured but invalid checkpoint fails closed with a clear analysis error.
- Existing perception, manual event, and metric behavior remains unchanged in
  this first integration; the model output is observable and consumable by the
  pipeline before it is allowed to drive public readiness.

## Readiness policy

Create a JavaScript validator for the local evaluation report. A training
evidence result is ready only when all of these hold:

- checkpoint exists and its SHA-256 matches the report;
- checkpoint contract and inference output validate;
- train/validation/test metrics are present and finite;
- held-out record count is positive and its source is `own_capture`;
- the evidence class is real own-capture, not synthetic smoke or third-party
  broadcast data;
- the report explicitly passes the configured metric gates.

`technique:*` and `footwork:layer:*` reports require this training evidence in
addition to their existing domain event/pose evidence. `footwork:pure` keeps
its existing own-capture/court evidence requirements. Missing or invalid
training evidence keeps modules `locked`; it does not make CI fail merely
because a maintainer has not provisioned private local data.

The existing domain benchmark runner and readiness integrity check must carry
the training-evidence status into reports and reject any passed report that
does not satisfy the policy. Smoke reports remain useful for proving execution
but can never change `readiness.seed.json` to `on`.

## Commands and verification

Add these commands:

- `npm run training:smoke`: generate a temporary small fixture, train, save a
  local checkpoint/manifest/evaluation report, reload the checkpoint, and prove
  inference. The command must report `readiness=locked` for the synthetic
  evidence class.
- `npm run training:run -- ...`: run the same bounded trainer against explicit
  provisioned source files and optional own-capture held-out records.
- `npm run test:training`: run reader/model/checkpoint/readiness unit tests.
- Keep `npm run verify` focused on repository-safe tests and metadata/readiness
  integrity; it must not be described as proof that a real model was trained.

Verification must include focused red-green tests, the full existing unit and
integration suite, smoke training, local evaluation/readiness checks,
`npm run verify`, and a website smoke test through the Codex in-app browser.
Real source training is `NOT_RUN` while the five source roots or explicit data
files remain absent. No raw dataset, video, extracted frame, or checkpoint may
be staged or pushed.

## Non-goals

- Downloading or vendoring any dataset, video, annotation, or upstream weight.
- Replacing the MediaPipe perception pipeline or heuristic event proposal in
  this milestone.
- Unlocking a public module from adapter metadata, a registry entry, a smoke
  fixture, or a third-party test split.
- Adding PyTorch, a transformer-sized model, or an unbounded data loader.
