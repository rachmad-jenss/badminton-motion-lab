# Plan 32: Single source of truth for the module inventory

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

The 12-stroke inventory is duplicated in `packages/contracts/src/ontology/strokes.ts`
and hardcoded again in three scripts plus the Supabase seed. Drift is silent:
`check-readiness-integrity.mjs` validates the seed against its own hardcoded list, not
against the contracts. Adding a stroke means editing five files in lockstep.

## Current state

- `packages/contracts/src/ontology/strokes.ts:3-15` — `export const TECHNIQUE_STROKES = [...] as const;`
- `scripts/run-domain-benchmarks.mjs:36-49` — local `TECHNIQUE_STROKES` + `allModuleIds()` + `moduleKind()`
- `scripts/run-fixture-benchmarks.mjs:29-42` — same three local definitions
- `scripts/check-readiness-integrity.mjs:26-38` — `expectedModules` built from a local list
- `supabase/seed.sql` — 25 `('module_id', 'locked', null)` rows

## Scope

**In scope**: `scripts/module-inventory.mjs` (new), the three scripts above.
**Out of scope**: `packages/contracts` TS source (it stays the source of truth), `supabase/seed.sql`
content (kept; a new check detects drift instead).

## Steps

1. Create `scripts/module-inventory.mjs`:
   ```js
   /**
    * Single source of truth for the module inventory, parsed from
    * packages/contracts/src/ontology/strokes.ts (the authoritative list).
    */
   import { readFileSync } from "node:fs";
   import { join, dirname } from "node:path";
   import { fileURLToPath } from "node:url";

   const root = join(dirname(fileURLToPath(import.meta.url)), "..");
   const strokesPath = join(root, "packages", "contracts", "src", "ontology", "strokes.ts");
   const source = readFileSync(strokesPath, "utf8");
   const block = source.match(/export const TECHNIQUE_STROKES = \[([\s\S]*?)\];/);
   if (!block) throw new Error("cannot parse TECHNIQUE_STROKES from " + strokesPath);
   export const TECHNIQUE_STROKES = [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

   export function allModuleIds() {
     const technique = TECHNIQUE_STROKES.map((s) => `technique:${s}`);
     const layers = TECHNIQUE_STROKES.map((s) => `footwork:layer:${s}`);
     return [...technique, "footwork:pure", ...layers];
   }

   export function moduleKind(id) {
     if (id === "footwork:pure") return "footwork_pure";
     if (id.startsWith("footwork:layer:")) return "footwork_layer";
     return "technique_stroke";
   }
   ```
2. In the three scripts, replace the local definitions with
   `import { TECHNIQUE_STROKES, allModuleIds, moduleKind } from "./module-inventory.mjs";`
   (or the subset each uses) and delete the local copies.
3. In `check-readiness-integrity.mjs`, additionally compare the Supabase seed:
   ```js
   const seedSqlPath = join(root, "supabase", "seed.sql");
   if (existsSync(seedSqlPath)) {
     const seedSql = readFileSync(seedSqlPath, "utf8");
     const sqlModules = [...seedSql.matchAll(/\(\'((?:technique|footwork):[^\']+)\',\s*\'(?:locked|on)\'/g)].map((m) => m[1]).sort();
     if (JSON.stringify(sqlModules) !== JSON.stringify(expectedIds)) {
       fail("supabase/seed.sql module list does not match the contract inventory");
     }
   }
   ```
4. Run `node --check` on all four files and the two read-only checks.

## Test plan

- `node scripts/check-readiness-integrity.mjs` exits 0 (seed.sql now cross-checked).
- `node scripts/check-no-synthetic-reports.mjs` exits 0.
- `node --check scripts/module-inventory.mjs scripts/run-domain-benchmarks.mjs scripts/run-fixture-benchmarks.mjs scripts/check-readiness-integrity.mjs` all exit 0.

## Done criteria

- [ ] All four files pass `node --check`
- [ ] `node scripts/check-readiness-integrity.mjs` exits 0 with seed cross-check active
- [ ] No `TECHNIQUE_STROKES = [` literal remains outside `strokes.ts` and `module-inventory.mjs`
- [ ] `git status --short` shows only the four scripts (+ new file) modified

## STOP conditions

- `strokes.ts` array format changes (the parser regex fails → update the regex, not the source).
- Integrity check fails for a real reason (report; do not weaken the check).

## Maintenance notes

- Adding a stroke now = edit `strokes.ts` only; scripts and seed drift are detected by CI.
- `supabase/seed.sql` still needs manual rows when the inventory grows; the check enforces sync.
