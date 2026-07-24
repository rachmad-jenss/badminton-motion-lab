# Plan 001: Fix Analyze JSX and make verify scripts green

> **Executor**: Follow steps; STOP if `apps/web` no longer uses App Router.

## Status
- **Priority**: P1 · **Effort**: S–M · **Risk**: LOW · **Depends on**: none · **Category**: bug/dx

## Why
`analyze/page.tsx` has an unclosed `<section>` so typecheck fails. `npm test` points at a non-hoisted `tsc` path. Without a green verify gate, later PRs cannot prove safety.

## Current state
- `apps/web/src/app/analyze/page.tsx` ~168–192: Local review stream `<section>` never closed before Perception `<section>`.
- `packages/contracts/package.json` test script uses `node_modules/typescript/bin/tsc` (missing under workspace hoist).
- Root `package.json` has no `verify` script; agent smoke not wired.

## Steps
1. Close the review-stream `</section>` after the `<video>` in `analyze/page.tsx`.
2. Change contracts + web `test` scripts to `tsc -p tsconfig.json --noEmit` (use PATH/`npx`).
3. Add root scripts: `"typecheck"`, `"test:agent"`, `"verify"` chaining typecheck + agent smoke + readiness.
4. Add minimal `eslint.config.mjs` + `eslint`/`eslint-config-next` so `npm run lint` is non-interactive, or change lint to `tsc` until eslint lands — prefer eslint flat config.
5. Add `.github/workflows/ci.yml` running `npm run verify` (and agent smoke with pip install).

## Verify
- `npm run typecheck` exit 0
- `npm run build -w @bml/web` exit 0
- `npm run lint` exit 0 (or documented equivalent)

## Out of scope
CV adapters, auth, readiness harness logic.
