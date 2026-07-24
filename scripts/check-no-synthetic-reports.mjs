/**
 * Fail if any validation report still claims synthetic baseline adapters.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const reportsDir = join(root, "validation", "reports");

if (!existsSync(reportsDir)) {
  console.log("No reports dir yet — OK for fresh checkout before first real benchmark.");
  process.exit(0);
}

let bad = 0;
for (const name of readdirSync(reportsDir)) {
  if (!name.endsWith(".json")) continue;
  const data = JSON.parse(readFileSync(join(reportsDir, name), "utf8"));
  const blob = JSON.stringify(data);
  if (blob.includes("Baseline synthetic")) {
    console.error(`Synthetic theater note in ${name}`);
    bad += 1;
  }
}
if (bad) process.exit(1);
console.log("No synthetic baseline notes in validation/reports.");
