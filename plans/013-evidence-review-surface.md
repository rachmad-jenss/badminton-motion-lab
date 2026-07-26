# Plan 013: Turn analysis output into an evidence review surface

> **Executor instructions**: This plan consumes existing response data. Do not
> invent metrics, scores, or evidence. If a field is absent, render it as
> withheld/unknown and report the contract mismatch instead of fabricating a
> fallback.
>
> **Drift check**: `git diff --stat 6730f6e..HEAD -- apps/web/src/app/analyze/page.tsx apps/web/src/lib/agent.ts packages/contracts/src/metrics/catalogue.ts`

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: Plan 012
- **Category**: direction | correctness
- **Planned at**: commit `6730f6e`, 2026-07-26

## Why this matters

The backend returns findings, events, limitations, confidence, and evidence
frame indices, but the result UI renders only a raw table of metric IDs and a
video element. The product requirements emphasize explaining what is measured,
showing the source frame, stating uncertainty, and allowing manual correction.
The current UI hides the core trust model.

## Current state

- `apps/web/src/app/analyze/page.tsx:13-29` types `findings`, events, metric
  limitations indirectly, and evidence frame indices.
- `apps/web/src/app/analyze/page.tsx:169-218` renders video, perception text,
  and a four-column metrics table but no findings or event controls.
- `apps/agent/main.py:392-465` returns findings, events, quality, court, and
  frame-window metadata in the summary.
- `packages/contracts/src/metrics/catalogue.ts:1-30` contains human-readable
  metric definitions, units, limitations, and fail-safe behavior.

## Scope

**In scope**: metric display mapping, findings list, withheld explanations,
confidence/limitation presentation, event timeline or frame links, and review
layout around the existing video.

**Out of scope**: new CV metrics, manual event editing API, cloud persistence,
video upload, and AI prose generation behavior.

## Steps

### Step 1: Build human-readable metric rows

Map metric IDs to the contracts catalogue. Show name, value, unit, confidence
label, and limitation when present. For withheld values, show the reason and
avoid styling them as a zero or failure score.

**Verify**: fixture response with measured, withheld, and unknown metrics
renders each state correctly; web typecheck passes.

### Step 2: Render findings and evidence events

Add a findings section from `summary.findings` and an event/evidence list from
`summary.events`. Each evidence frame index should be an actionable control
that seeks the existing video where browser support permits, or otherwise
shows the frame reference clearly.

**Verify**: a controlled result with contact and metric findings shows both;
clicking an evidence control changes the video time or displays a clear
fallback; no fabricated finding appears.

### Step 3: Explain uncertainty and limitations

Use visible labels for confidence and analysis limitations, including invalid
court calibration and missing tracks. Keep deterministic computed findings
separate from optional BYOK prose.

**Verify**: no-BYOK result remains complete and understandable; withheld
metrics are not presented as recommendations; `npm.cmd run lint -w @bml/web`
passes.

## Done criteria

- [ ] Findings, events, evidence frames, and limitations are visible.
- [ ] Metric IDs use catalogue names and units.
- [ ] Withheld values show why they are withheld.
- [ ] Evidence controls are usable with keyboard and do not invent data.
- [ ] BYOK prose remains optional and clearly labeled.

## STOP conditions

- The response contract lacks a field needed for a requested interaction.
- Seeking evidence requires a new media API rather than the existing video.
- A catalogue definition conflicts with the returned metric unit.

## Maintenance notes

New metrics must add a catalogue definition before appearing in the UI. Review
the fail-safe and limitation text whenever a metric contract changes.
