# Training-source integration

BML uses external training sources through a local registry rather than
vendoring data. The committed registry is
[`validation/training-sources.json`](../../validation/training-sources.json).

## Selected sources

| Source | Use in BML | Local policy |
| --- | --- | --- |
| BFMD | pose, court, shuttle, stroke, and hit-event supervision | local research use; no public media redistribution |
| BST | first stroke-classification training baseline | keep the external checkout and weights local |
| ShuttleSet | stroke/contact/tactical labels | annotations and broadcast media have separate terms |
| ShuttleSet22 | newer stroke/contact train/validation/test records | same broadcast-media restriction as ShuttleSet |
| RacketVision | racket keypoints, shuttle/ball tracking, trajectory features | provenance review before any redistribution |

## Bounded setup

1. Read [`validation/DATASET_ATTRIBUTION.md`](../../validation/DATASET_ATTRIBUTION.md)
   and the upstream terms.
2. Provision each source manually under its registry `localRoot`.
3. Do not commit raw videos, annotations, checkpoints, or extracted frames.
4. Run the metadata-only check:

   ```powershell
   npm run training:sources
   ```

The check validates source identity, adapter names, license separation, and
safe local roots. It intentionally does not download, decode, or load a full
match. Any future trainer must process one rally/window at a time, cap frames
and resolution, and keep concurrency at one by default.

The source-specific record normalizers live in
[`scripts/training-adapters.mjs`](../../scripts/training-adapters.mjs). They
map BFMD, BST, ShuttleSet/ShuttleSet22, and RacketVision annotation records to
the bounded `bml-training-record-v1` shape. The
[`TRAINING_CHECKPOINT_CONTRACT`](../../scripts/training-adapters.mjs) defines
the required model outputs and reserves held-out evaluation for own-capture
data.

Run the adapter contract tests with:

```powershell
npm run test:training-adapters
```

## Model roles

- Start stroke classification with the MIT-licensed BST implementation and
  ShuttleSet/ShuttleSet22 labels.
- Use BFMD to add dense pose/court/shuttle/hit supervision where its local
  research-only terms permit.
- Use RacketVision outputs as auxiliary racket/shuttle features after its local
  data provenance is recorded.
- Validate the resulting BML pipeline on held-out own-capture clips. Training
  sources do not automatically unlock public readiness.

This repository change wires source contracts, normalization, and the license
boundary. It does not pretend that model weights have been trained when the
source data has not been provisioned locally.
