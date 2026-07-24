# ADR-013 — No Mandatory Original Video Upload

## Status
Accepted (grilled 2026-07-23) — supersedes Master Plan Phase 1 wording about "video upload"

## Decision
Original training/match video stays on the user machine. The Local Agent serves proxy/stream to the browser on localhost. Cloud may store metric summaries and optional tiny evidence thumbnails later, never dense pose time series in Postgres.

## Consequences
- Pairing web ↔ agent is mandatory for scrubbing evidence
- Public marketing must explain Windows agent install
