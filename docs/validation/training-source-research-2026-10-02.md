# Training-source research for Badminton Motion Lab

Research date: 2026-10-02

## Decision

The best practical training stack is not one repository:

1. **BFMD** for the richest internal badminton supervision: pose, court,
   shuttle, shot type, and hit-event annotations.
2. **BST** for the first reusable stroke-classification training code. Its
   source repository is MIT-licensed and already supports ShuttleSet-style
   inputs containing joints, shuttle, and court-position features.
3. **ShuttleSet/ShuttleSet22** for stroke taxonomy, hitting frame, player
   location, and tactical pretraining.
4. **Own-capture clips** for the held-out public-readiness gate and domain
   adaptation to BML's side-ish full-body capture protocol.
5. **RacketVision** as an optional auxiliary source for racket keypoints and
   shuttle/ball tracking, subject to a separate provenance check for the
   downloaded media.

This stack lets BML keep its code and adapters separate from third-party media
and dataset terms. It does not make third-party videos or annotations MIT just
because an upstream repository's code is MIT.

## Current BML boundary

BML currently runs a local MediaPipe pose pipeline, derives racket and shuttle
tracks, and produces deterministic event proposals and metrics. There is no
training command or model-checkpoint contract in the current repository. The
first integration should therefore be an adapter and an offline trainer, not a
replacement of the live pipeline in one step.

The existing domain manifest currently allows `shuttleset` and `own_capture`
sources, and the benchmark expects event/contact evidence separately from pose
evidence. Any new source needs an explicit adapter, attribution record, and
held-out evaluation split before it can be used to unlock public readiness.

## Candidate comparison

| Candidate | What it provides | BML fit | License / rights decision |
| --- | --- | --- | --- |
| [BFMD](https://github.com/Ning-D/BFMD) and its [dataset page](https://ning-d.github.io/BFMD-Dataset/) | Full-match badminton annotations: player pose, court, shuttle trajectory, shot type, hit events, and singles/doubles coverage. | **Best data source for internal pose, court, shuttle, footwork, and hit-event training.** | The dataset page says non-commercial academic research only and no redistribution; videos are not redistributed because BWF TV owns the source rights. Do not vendor it into a public MIT package. |
| [BST: Badminton Stroke-type Transformer](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer) | MIT-licensed training/inference code; preprocessing for joints, shuttlecock, and court position; ShuttleSet, BadmintonDB, and TenniSet paths. | **Best first training-code base for `technique:*` stroke classification.** Adapt its normalized features and model output to BML contracts; it does not by itself solve all BML metrics or contact truth. | Code is MIT. Treat the datasets and downloaded weights as separate artifacts with their own terms. |
| [ShuttleSet](https://github.com/wywyWang/CoachAI-Projects/tree/main/ShuttleSet) / [ShuttleSet22](https://github.com/wywyWang/CoachAI-Projects/tree/main/CoachAI-Challenge-IJCAI2023/ShuttleSet22) | 18-class stroke labels, hitting frame/time, player/opponent locations, court homography, landing fields, and rally context. ShuttleSet has 36,492 strokes; ShuttleSet22 has train/validation/test splits totaling 33,612 strokes. | **Best source for stroke taxonomy, contact-frame supervision, and tactical pretraining.** It does not provide the same dense per-frame body pose needed by BML's pose metrics. | The CoachAI repository is MIT; a downstream attribution file identifies the ShuttleSet annotation CSVs as MIT, but the match videos remain broadcaster-owned. Use locally under the applicable terms; publish only metadata/adapters unless separate video rights are obtained. |
| [RacketVision](https://github.com/OrcustD/RacketVision) and its [dataset card](https://huggingface.co/datasets/linfeng302/RacketVision) | MIT project; badminton ball tracks, five-keypoint racket pose, COCO annotations, splits, and trainable BallTrack/RacketPose/TrajPred modules. | **Best auxiliary detector source** for racket/shuttle signals and possible replacement of BML's heuristic tracks. It is not a stroke/contact classifier. | The project and dataset card identify MIT, but the card does not establish the rights of every included video asset. Audit per-file provenance before redistribution or public evidence use. |
| [Badminton-Pose-Estimation-Keypoints](https://universe.roboflow.com/badminton-movement-and-pose-estimation/badminton-pose-estimation-keypoints/dataset/1) | 4,157 keypoint images with train/validation/test splits. | **Useful supplemental pose pretraining only.** It has no stroke contact frame, court calibration, shuttle trajectory, or temporal sequence. | Listed as CC BY 4.0. Preserve attribution and verify the underlying image provenance before packaging derived data. |
| [TemPose-BadmintonActionRecognition](https://github.com/MagnusPetersenIbh/TemPose-BadmintonActionRecognition) | MIT code; 2-player 17-joint pose sequences, ground-plane ankle positions via homography, shuttle trajectories, and stroke segments. | **Good simpler baseline/adapter** for sequence-level stroke recognition and footwork features. Its 13-class Olympic broadcast taxonomy needs mapping to BML's 12 strokes. | Code is MIT. The data is reconstructed from broadcast videos and ELAN annotations; media rights remain separate and must not be assumed MIT. |
| [BadmintonFusion35](https://github.com/mgck2nzwry-oss/BadmintonFusion35) | MIT software for four-camera calibration, 35-point court geometry, synchronized pose/IMU processing, QC, and a limited de-identified demonstration. | **Useful capture/calibration reference**, not a large training dataset for BML's single-camera web workflow. | MIT applies to software/documentation; the repository explicitly keeps participant media and the full multi-participant dataset outside the public release. |
| [BadminSense](https://github.com/taizhouchen/BadminSense_Dataset) | Video, smartwatch IMU/audio, four stroke labels, impact location, and quality scores. | Useful only for an optional contact/quality research experiment; it does not cover BML court and footwork supervision. | CC BY-NC-ND 4.0: attribution, non-commercial use, and no derivatives. **Do not use as a default source for a commercial or freely redistributable MIT product.** |
| [Fine-Badminton](https://zenodo.org/records/20292976) | 10.72 hours, 29 stroke categories, and frame-level temporal annotations. | Useful for internal temporal-action pretraining if its task matches the model. It is not the shortest path to BML's pose/court metrics. | The record says non-commercial academic research only and retains original broadcast copyright. **Exclude from public release evidence.** |

## Recommended mapping into BML

| BML capability | Primary source | Adapter output |
| --- | --- | --- |
| `technique:<stroke>` classification | BFMD + ShuttleSet/22; BST or TemPose model | Per-frame pose, shuttle/racket features, stroke ID, confidence, and contact-frame proposal |
| Contact timing | ShuttleSet/22 hit frame; BFMD hit-event annotations | `contactFrameTruth` and a frame-indexed evaluation record |
| Pure footwork | BFMD pose/court data for internal pretraining; own capture for release proof | 17-joint pose, court corners, ankle trajectories, split-step/first-step/base-return events |
| Footwork layer | BFMD pose + shot/hit context; ShuttleSet/22 as context only | Stroke-conditioned footwork sequence with separate pose and event provenance |
| Racket metrics | RacketVision racket pose, then own-capture validation | Five-keypoint racket track mapped to BML's racket artifact contract |
| Shuttle metrics | RacketVision or BFMD shuttle annotations | Pixel-space shuttle track with visibility/confidence and source metadata |
| Public readiness | Own-capture clips recorded under BML's protocol | Held-out truth clips; no third-party broadcast media in the release package |

## Safe integration rules

- Keep training data out of Git. Store only adapters, schema mappings,
  download instructions, checksums, attribution, and license/provenance fields.
- Keep `train`, `validation`, and held-out `public-evidence` splits disjoint by
  match/player where possible; never report training clips as readiness evidence.
- Decode one rally/window at a time with bounded frame and resolution caps. Do
  not load an entire full-match video or all extracted frames into memory.
- Start with one BFMD match or a small ShuttleSet slice as a smoke test before
  downloading multi-gigabyte packages or launching model training.
- Normalize all sources into BML's coordinate convention before training:
  frame index, FPS, pixel coordinates, court corners, pose joint order, and
  explicit visibility/confidence.
- Preserve third-party notices beside every adapter. A code MIT license, an
  annotation MIT license, and a video copyright notice are separate entries.

## Licensing finding in this checkout

The current checkout has no top-level `LICENSE` file. Its [README license
section](../../README.md#license) currently says **“Private / hobby research
project unless otherwise stated.”** If the intended BML license is MIT, add the
actual MIT license file and make the data/third-party notice boundary explicit
before advertising the whole project as MIT.

## Sources checked

- [ShuttleSet paper](https://arxiv.org/abs/2306.04948)
- [ShuttleSet22 paper](https://arxiv.org/abs/2306.15664)
- [BST MIT license](https://github.com/Va6lue/BST-Badminton-Stroke-type-Transformer/blob/main/LICENSE)
- [TemPose MIT license](https://github.com/MagnusPetersenIbh/TemPose-BadmintonActionRecognition/blob/main/LICENSE)
- [CoachAI Projects MIT license](https://github.com/wywyWang/CoachAI-Projects/blob/main/LICENSE)
- [ShuttleSet attribution and video-rights boundary](https://github.com/ahalp90/badminton_cv_annotator/blob/main/data/ATTRIBUTION.md)
- [RacketVision MIT license](https://github.com/OrcustD/RacketVision/blob/main/LICENSE)
- [Badminton pose keypoint dataset and CC BY 4.0 listing](https://universe.roboflow.com/badminton-movement-and-pose-estimation/badminton-pose-estimation-keypoints/dataset/1)
- [BadminSense license notice](https://github.com/taizhouchen/BadminSense_Dataset/blob/main/README.md)
- [BadmintonFusion35 data policy](https://github.com/mgck2nzwry-oss/BadmintonFusion35)
