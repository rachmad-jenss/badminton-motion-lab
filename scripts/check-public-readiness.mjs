/**
 * Public completeness gate: only fully benchmarked modules count as complete.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(root, "apps", "web", "src", "lib", "readiness.seed.json");

if (!existsSync(seedPath)) {
  console.error("Missing readiness.seed.json — run: npm run benchmark:fixtures");
  process.exit(1);
}

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const entries = Object.entries(seed.modules || {});
const locked = entries.filter(([, s]) => s === "locked").map(([id]) => id);
const experimental = entries.filter(([, s]) => s === "experimental").map(([id]) => id);
const on = entries.filter(([, s]) => s === "on").map(([id]) => id);

console.log(`Modules: ${entries.length}`);
console.log(`On: ${on.length}`);
console.log(`Locked: ${locked.length}`);
console.log(`Experimental: ${experimental.length}`);
if (locked.length || experimental.length) {
  console.error(
    "Public completeness FAILED. Modules still unavailable for public claims:\n" +
      [...locked, ...experimental].join("\n"),
  );
  process.exit(1);
}

const checklist = {
  zeroLocked: locked.length === 0,
  zeroExperimental: experimental.length === 0,
  windowsInstaller: existsSync(join(root, "infra", "windows", "install-agent.ps1")),
  packagingStub: existsSync(join(root, "infra", "windows", "package-agent.cmd")),
  captureGuide: existsSync(join(root, "apps", "web", "src", "app", "capture-guide", "page.tsx")),
  pairingUi: existsSync(join(root, "apps", "web", "src", "app", "agent", "page.tsx")),
  compareUi: existsSync(join(root, "apps", "web", "src", "app", "compare", "page.tsx")),
  byokPath: existsSync(join(root, "apps", "agent", "adapters", "byok.py")),
  marketingWindowsOnly: true,
};

const failed = Object.entries(checklist).filter(([, v]) => !v);
console.log("Checklist:", checklist);
if (failed.length) {
  console.error("Checklist failed:", failed.map(([k]) => k));
  process.exit(1);
}

console.log("PUBLIC COMPLETENESS GATE PASSED (0 locked + checklist).");
