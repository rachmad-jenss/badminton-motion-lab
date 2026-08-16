/**
 * Single source of truth for the module inventory, parsed from
 * packages/contracts/src/ontology/strokes.ts (the authoritative list).
 *
 * Adding or renaming a stroke must happen in the contracts package only;
 * this module (and every script that imports it) picks the change up
 * automatically.
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
