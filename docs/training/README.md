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

The repository includes bounded provisioning helpers for the two sources that
are not hosted in the Git checkout itself:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/provision-bfmd-annotations.ps1
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/provision-racketvision-static.ps1
```

They write only under ignored `validation/training-sources/` directories. The
BFMD helper fetches the public annotation package and skips its inaccessible
cache/video paths. The RacketVision helper fetches global non-video
annotations, `badminton/info`, and the bounded `badminton/all/match1` sample;
it never fetches `*/videos/*`, extracted frames, or weights. Verify the local
file counts and provenance manifests before using a source.

The source-specific record normalizers live in
[`scripts/training-adapters.mjs`](../../scripts/training-adapters.mjs). They
map BFMD, BST, ShuttleSet/ShuttleSet22, and RacketVision annotation records to
the bounded `bml-training-record-v1` shape. ShuttleSet/ShuttleSet22 records
carry a bounded rally/window frame range and precomputed temporal summaries;
the same temporal summaries are calculated from local-agent tracks at
inference. The
[`TRAINING_CHECKPOINT_CONTRACT`](../../scripts/training-adapters.mjs) defines
the required model outputs, uses checkpoint contract v2 with a relative-window
contact target, and reserves held-out evaluation for own-capture data.

Run the adapter contract tests with:

```powershell
npm run test:training-adapters
```

## Real bounded training

`npm run verify` and the adapter tests do not train a model. They only validate
repository code and metadata. A real run needs the source checkouts and an
explicit JSONL/CSV record file for every selected dataset source under the
registry root. The trainer reads one record at a time, caps sequences and
records, uses batch size at most 8, and writes only derived artifacts.

First run the synthetic proof:

```powershell
npm run training:smoke
```

This must report non-zero `trainingUpdates`, successful checkpoint reload and
inference-contract validation, but it must remain `readiness=locked`. It is
not training-source or held-out evidence.

After provisioning ShuttleSet/ShuttleSet22, create deterministic match-level
records (the source CSVs use Mandarin stroke labels):

```powershell
python scripts/prepare-training-records.py --source-id shuttleset `
  --root validation/training-sources/shuttleset `
  --output validation/training-sources/shuttleset/records.normalized.jsonl
python scripts/prepare-training-records.py --source-id shuttleset22 `
  --root validation/training-sources/shuttleset22 `
  --output validation/training-sources/shuttleset22/records.normalized.jsonl
```

To add the four labels that are absent from ShuttleSet/ShuttleSet22, prepare
only BFMD records with caption-derived label evidence. The preparer also attaches
bounded player-box and shuttle tracks from the same match window; it does not
load video or commit the annotations:

```powershell
python scripts/prepare-training-records.py --source-id bfmd `
  --root validation/training-sources/bfmd `
  --output validation/training-sources/bfmd/records.missing-labels.tracked.normalized.jsonl `
  --include-label forehand `
  --include-label backhand `
  --include-label block `
  --include-label jump_smash
```

BFMD caption-derived labels use the ordered `refined`, `clean`, and `auto`
caption fields: `jump smash`, `backhand`, and `forehand` are selected before
the tactical `shot_type`. The derivation is recorded as local training
provenance and is not public-readiness evidence. The four rare labels remain
quality-limited until more explicitly labelled records are provisioned.

A minimal real-source run is:

```powershell
npm run training:run -- `
  --source bst `
  --source shuttleset `
  --source shuttleset22 `
  --records shuttleset=validation/training-sources/shuttleset/records.normalized.jsonl `
  --records shuttleset22=validation/training-sources/shuttleset22/records.normalized.jsonl `
  --epochs 8 `
  --shuffle-buffer-size 1024 `
  --learning-rate 0.01 `
  --max-records 50000
```

Add BFMD or RacketVision with another `--source` and explicit `--records`
mapping when their normalized records are provisioned. The BST checkout is
required as training-code provenance; dataset sources require both a checkout
and an explicit records mapping. The command fails with `TRAINING NOT_RUN`
when a root or mapping is missing, and that is not a successful training run.

The baseline uses a seeded one-hidden-layer ReLU classifier with a bounded
shuffle buffer; batch size remains capped at 8 and the full source is never
materialized in memory. The run writes `checkpoint.json`, `checkpoint.sha256`,
`training-manifest.json`, and `evaluation.json` below the ignored
`validation/training-derived/` directory. The checkpoint is validated on load
and includes `strokeId`, absolute `contactFrame`, `contactFrameRelative`,
`confidence`, and `provenance`. Contact regression is trained against the
relative position inside the rally/window, then converted to the absolute frame
using the inference window. Evaluation includes per-class precision/recall/F1,
support-aware macro-F1, all-taxonomy macro-F1, and a confusion matrix. It uses
inverse-frequency class-balanced cross-entropy from the train split and records
`classCounts`, `classWeights`, `classCoverage`, and `unsupportedClasses` so
missing labels cannot be hidden by aggregate accuracy. It contains no raw
records, video, or frames. To inspect the local readiness
decision for the newest run (or a specific report), use:

```powershell
npm run readiness:training
$env:BML_TRAINING_EVALUATION = "validation/training-derived/run-YYYYMMDD-HHMMSS/evaluation.json"
npm run readiness:training
```

Only a report with finite train/validation/test metrics, a positive
`own_capture` held-out set, a passing metric gate, matching checkpoint and
manifest checksums, and valid inference output can be `ready`. Synthetic smoke,
BST/ShuttleSet broadcast data, and other third-party data remain `not-ready`.
If the report is ready, configure the local agent explicitly with its ignored
checkpoint path:

```powershell
$env:BML_STROKE_CHECKPOINT = "validation/training-derived/run-YYYYMMDD-HHMMSS/checkpoint.json"
```

This makes the prediction observable in the analysis summary and
`stroke_classifier.json`; it does not replace the existing perception or event
pipeline. Public module readiness remains fail-closed until the domain report
also passes.

## Model roles

- Start stroke classification with the MIT-licensed BST implementation and
  ShuttleSet/ShuttleSet22 labels.
- Use BFMD to add dense pose/court/shuttle/hit supervision where its local
  research-only terms permit.
- Use RacketVision outputs as auxiliary racket/shuttle features after its local
  data provenance is recorded.
- Validate the resulting BML pipeline on held-out own-capture clips. Training
  sources do not automatically unlock public readiness.

This repository wires source contracts, bounded training, checkpoint
validation, inference, and the license boundary. It does not pretend that
model weights have been trained when the source data has not been provisioned
locally.
