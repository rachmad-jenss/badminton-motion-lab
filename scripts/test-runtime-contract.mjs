import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootPackage = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const webPackage = JSON.parse(await readFile(join(root, "apps", "web", "package.json"), "utf8"));
const lockfile = JSON.parse(await readFile(join(root, "package-lock.json"), "utf8"));
const workflow = await readFile(join(root, ".github", "workflows", "ci.yml"), "utf8");
const installer = await readFile(join(root, "infra", "windows", "install-agent.ps1"), "utf8");

assert.equal(rootPackage.engines.node, lockfile.packages[""].engines.node);
assert.equal(webPackage.scripts.start, "node ../../scripts/serve-export.mjs");
assert.match(workflow, /pip install -r requirements\.lock\.txt/);
assert.match(installer, /pip install -r requirements\.lock\.txt/);
assert.match(installer, /ffmpeg/);
console.log("runtime contract test passed");
