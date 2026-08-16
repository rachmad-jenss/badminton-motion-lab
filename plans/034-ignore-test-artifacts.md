# Plan 34: Ignore Playwright/MCP test artifacts

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

`.playwright-mcp/` (console/page dumps) and `apps/web/test-results/` (Playwright output)
are untracked and unignored, so `git status` is permanently polluted and the artifacts
risk being committed accidentally.

## Current state

- `.gitignore` has no entries for either path (`git check-ignore` returns nothing).
- `git status --short` shows `?? .playwright-mcp/` and `?? apps/web/test-results/`.

## Scope

**In scope**: `.gitignore` only.
**Out of scope**: deleting the untracked directories (leave them; they stop showing after ignore).

## Steps

1. Append to `.gitignore`:
   ```
   .playwright-mcp/
   apps/web/test-results/
   apps/web/playwright-report/
   playwright-report/
   ```

## Test plan

- `git check-ignore .playwright-mcp apps/web/test-results apps/web/playwright-report` prints the paths.

## Done criteria

- [ ] `git check-ignore .playwright-mcp apps/web/test-results` returns both paths
- [ ] `git status --short` no longer lists them

## STOP conditions

- None material (pure ignore-list change).

## Maintenance notes

- Re-check after future Playwright/MCP upgrades for new artifact dirs.
