# Plan 001: Fix Analyze JSX and green verify scripts

> **Executor**: Close unclosed `<section>` in Analyze page; fix contracts `tsc` path; add root `verify`. STOP if Next major upgrade required.

## Why
`analyze/page.tsx` has an unclosed section (lines ~168–177). `npm test` fails because contracts points at non-hoisted `node_modules/typescript/bin/tsc`.

## Steps
1. Close the Local review stream `</section>` before Perception section.
2. Change `packages/contracts/package.json` test/build to `tsc -p tsconfig.json` (workspace binary).
3. Add root scripts: `typecheck`, `test:agent`, `verify`.
4. Add minimal eslint config so `lint` is non-interactive OR change lint to `tsc --noEmit` until eslint lands.

## Verify
- `npm run typecheck` exit 0
- `npm run build -w @bml/web` exit 0
