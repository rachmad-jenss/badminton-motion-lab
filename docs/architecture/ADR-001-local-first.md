# ADR-001 — Local-First Execution

## Status
Accepted (grilled 2026-07-23)

## Decision
All heavy video processing runs on the Windows Local Agent by default. Cloud is control plane only.

## Consequences
- Original video is not uploaded by default
- Browser reviews media via localhost stream from the agent
- Offline agent → cloud summaries only + Start Agent CTA
