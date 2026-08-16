# Plan 35: Make Supabase documentation honest about being unwired

> **Executor instructions**: Follow this plan step by step. Run every verification
> command and confirm the expected result before moving on. If a STOP condition
> occurs, stop and report — do not improvise. Update the status row in
> `plans/README.md` when done (unless a reviewer maintains the index).
>
> **Drift check (run first)**: `git diff --stat aa1479a..HEAD -- <in-scope paths>`
> If in-scope files changed since this plan was written, compare excerpts against
> live code; on mismatch, STOP.

## Status

- **Priority**: P1 | P2
- **Effort**: S | M
- **Risk**: LOW
- **Depends on**: see body
- **Category**: see body
- **Planned at**: commit `aa1479a`, 2026-08-16

## Why this matters

`.env.example` and the README describe a Supabase "cloud control plane / cloud summaries"
that the shipped static web app never calls (no Supabase dependency, no client code, static
export only). Beginners copy dead env vars and expect cloud behavior that does not exist.

## Current state

- `.env.example` lines 1-6 document `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`.
- `README.md` step 4: "Supabase (optional for cloud summaries) — Apply … to your project."
- `apps/web/package.json` has no supabase dependency; grep of `apps/web/src` for supabase/client = 0 hits.

## Scope

**In scope**: `.env.example`, `README.md`.
**Out of scope**: wiring Supabase (a product decision, out of this plan's scope).

## Steps

1. `.env.example`: prefix the Supabase block with a comment:
   ```
   # Reserved for a future cloud control plane — the current static web app does
   # not read these values yet. Local analysis works without them.
   ```
2. `README.md` step 4: replace the heading/body with:
   ```md
   ### 4. Supabase (reserved, not yet wired)

   The `supabase/` migrations and `.env.example` Supabase keys are reserved for a future
   cloud control plane (metadata only). The current static web app never calls Supabase;
   local analysis works without any Supabase setup. Dense pose/racket/shuttle time series
   never go into Postgres (ADR-013).
   ```

## Test plan

- No runtime tests needed; verify the README/env files render as intended (markdown review).

## Done criteria

- [ ] `.env.example` Supabase block carries the reserved/unwired comment
- [ ] `README.md` step 4 no longer implies live cloud summaries
- [ ] `git status --short` shows only `.env.example` and `README.md` modified

## STOP conditions

- None material.

## Maintenance notes

- When cloud summaries are actually implemented, re-document with the real setup steps.
