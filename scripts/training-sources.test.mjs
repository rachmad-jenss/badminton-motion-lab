import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { validateTrainingSourceManifest } from "./check-training-sources.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const committedManifest = JSON.parse(
  readFileSync(join(root, "validation", "training-sources.json"), "utf8"),
);

function copyManifest() {
  return structuredClone(committedManifest);
}

test("accepts all selected training sources with separated license fields", () => {
  const result = validateTrainingSourceManifest(copyManifest());

  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.sources.map((source) => source.id), [
    "bfmd",
    "bst",
    "shuttleset",
    "shuttleset22",
    "racketvision",
  ]);
});

test("rejects a manifest missing one of the selected sources", () => {
  const manifest = copyManifest();
  manifest.sources = manifest.sources.filter((source) => source.id !== "racketvision");

  const result = validateTrainingSourceManifest(manifest);

  assert.match(result.errors.join("\n"), /missing required source: racketvision/);
});

test("rejects a local source root that escapes the configured root", () => {
  const manifest = copyManifest();
  manifest.sources[0].localRoot = "validation/training-sources/../outside";

  const result = validateTrainingSourceManifest(manifest);

  assert.match(result.errors.join("\n"), /localRoot must be exactly/);
});

test("rejects restricted media marked as public evidence", () => {
  const manifest = copyManifest();
  manifest.sources[0].publicEvidence = true;

  const result = validateTrainingSourceManifest(manifest);

  assert.match(result.errors.join("\n"), /cannot be marked publicEvidence/);
});
