# Dataset attribution and license notes

Updated 2026-08-16 as part of Plan 028 (domain readiness roadmap).

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
