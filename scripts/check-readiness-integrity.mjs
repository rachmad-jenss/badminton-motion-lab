/**
 * Verify that readiness is internally consistent and never claims public
 * completeness from a smoke-only or synthetic fixture.
 *
 * This is deliberately separate from check-public-readiness.mjs: an honest
 * incomplete product should make CI visible without being converted into a
 * false green public release claim.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(root, "apps", "web", "src", "lib", "readiness.seed.json");
const reportsDir = join(root, "validation", "reports");
const truthPath = join(root, "validation", "fixtures", "person_1280x720_30fps.truth.json");

const expectedModules = [
  ...[
    "serve",
    "forehand",
    "backhand",
    "smash",
    "clear",
    "drop",
    "drive",
    "net_shot",
    "lift",
    "block",
    "defensive_return",
    "jump_smash",
  ].flatMap((stroke) => [`technique:${stroke}`, `footwork:layer:${stroke}`]),
  "footwork:pure",
];

function fail(message) {
  console.error(`Readiness integrity FAILED: ${message}`);
  process.exit(1);
}

if (!existsSync(seedPath)) fail("missing readiness.seed.json");
if (!existsSync(reportsDir)) fail("missing validation/reports");

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, "utf8")) : null;
const seedIds = Object.keys(seed.modules || {}).sort();
const expectedIds = [...expectedModules].sort();
if (JSON.stringify(seedIds) !== JSON.stringify(expectedIds)) {
  fail(`seed modules do not match the contract inventory`);
}

const reports = new Map();
for (const name of readdirSync(reportsDir)) {
  if (!name.endsWith(".json")) continue;
  const report = JSON.parse(readFileSync(join(reportsDir, name), "utf8"));
  if (!report.moduleId) fail(`${name} has no moduleId`);
  reports.set(report.moduleId, report);
  const notes = (report.notes || []).join(" ");
  if (/synthetic|walking person fixture/i.test(notes)) {
    if (report.passed) fail(`${report.moduleId} passed using a non-domain/synthetic fixture`);
  }
}

for (const moduleId of expectedModules) {
  const report = reports.get(moduleId);
  if (!report) fail(`missing report for ${moduleId}`);
  const expectedStatus = report.passed ? "on" : "locked";
  if (seed.modules[moduleId] !== expectedStatus) {
    fail(`${moduleId} seed=${seed.modules[moduleId]} report=${expectedStatus}`);
  }
}

const allOn = expectedModules.every((moduleId) => seed.modules[moduleId] === "on");
if (Boolean(seed.complete) !== allOn) {
  fail(`seed.complete=${Boolean(seed.complete)} does not match module statuses`);
}

const domainFixture = truth?.fixtureKind === "badminton_stroke";
if (Boolean(seed.complete) && !domainFixture) {
  fail("public completeness is claimed without a badminton_stroke fixture");
}

console.log(`Readiness provenance valid. complete=${Boolean(seed.complete)} domainFixture=${domainFixture}`);
if (!allOn) {
  console.log("Public completeness is not ready; locked modules remain intentionally visible.");
}
