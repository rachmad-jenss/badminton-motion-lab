# Dataset attribution and license notes

Updated 2026-10-02 for the training-source registry. The BML source code is
MIT-licensed, but that license does not change the terms of third-party data.

Training media and external checkouts stay outside Git. Keep the source ID,
upstream URL, checksum, license text, and any permission record with the local
training run.

## BFMD (training only)

[BFMD](https://github.com/Ning-D/BFMD) provides full-match badminton
annotations for pose, court, shuttle, shot type, and hit events. Its [dataset
page](https://ning-d.github.io/BFMD-Dataset/) states that the release is for
non-commercial academic research, must not be redistributed, and does not
redistribute the BWF TV source videos. It may be used only in a local run that
honors those terms; it is not public-readiness evidence.

For the local BML stroke baseline, four currently absent classes are derived
only from BFMD caption text (`forehand`, `backhand`, `block`, and
`jump_smash`, with `shot_type` as the fallback). This is a documented local
label derivation, not a claim that the ShuttleSet taxonomy contains those
classes; its records remain training-only and are not public-readiness evidence.

## BST (training code)

[BST](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer) is
MIT-licensed source code for skeleton-based stroke classification and includes
normalization paths for joints, shuttlecock, and court position. Its datasets,
downloaded weights, and upstream video rights remain separate artifacts.

## ShuttleSet (event/contact evidence)

ShuttleSet is the singles badminton dataset used for event/contact evidence in
the domain benchmark manifest.

- Source: ShuttleSet — "A Human-Annotated Stroke-Level Singles Dataset for
  Badminton Tactical Analysis" (Wang, Wu, Xie, ...). Repository and annotation
  code are distributed under the MIT license; the match videos remain
  copyrighted by their original broadcasters.
- What it provides: 18 tactical stroke classes (clear, smash, drop, drive,
  serve, net shot, ...), per-stroke hitting time/frame at 30 fps, player and
  shuttle locations, and a per-stroke backhand flag.
- Use policy in this project: clips are processed locally for private research
  and benchmark evidence. No ShuttleSet media is committed to this repository.
  Redistribution or commercial use of the footage requires a separate rights
  review before public release.

## ShuttleSet22 (training only)

[ShuttleSet22](https://github.com/wywyWang/CoachAI-Projects/tree/main/CoachAI-Challenge-IJCAI2023/ShuttleSet22)
extends ShuttleSet with train/validation/test stroke records, hitting frame,
player positions, and court homography fields. The CoachAI repository carries
an MIT license and the annotation CSVs have a separate MIT attribution notice,
but the referenced match videos remain broadcaster-owned. Do not redistribute
those videos or use them as public evidence without a separate rights review.

## RacketVision (training code and auxiliary annotations)

[RacketVision](https://github.com/OrcustD/RacketVision) is MIT-licensed code for
ball tracking, five-keypoint racket pose, and trajectory prediction. Its
[dataset card](https://huggingface.co/datasets/linfeng302/RacketVision) labels
the dataset MIT, but BML still requires per-file provenance review before any
downloaded video or derived media is redistributed or promoted to public
readiness evidence.

## Fine-Badminton (research-only, never release evidence)

Fine-Badminton (Zenodo) is explicitly non-commercial academic research only
and carries a copyright notice. It is therefore excluded from release gate
evidence. It may only be used for internal R&D comparison that never lands in
`validation/reports/` or `readiness.seed.json`.

## Own-capture clips

Pose-metric evidence uses clips recorded by the maintainer following
`docs/capture-protocols/side-ish-full-body-v1.md`. These clips live in the
gitignored `validation/domain-media/` folder; the manifest commits only
identifiers and SHA-256 hashes.
