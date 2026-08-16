/**
 * Verify that readiness is internally consistent and never claims public
 * completeness from a smoke-only or synthetic fixture.
 *
 * Deliberately separate from check-public-readiness.mjs: an honest incomplete
 * product should make CI visible without being converted into a false green
 * public release claim.
 *
 * Domain-aware since Plan 028: reports produced by run-domain-benchmarks.mjs
 * carry an evidence block referencing clips in validation/domain-manifest.json.
 * Smoke reports (single committed fixture) keep their original provenance
 * checks unchanged.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = join(root, "apps", "web", "src", "lib", "readiness.seed.json");
const reportsDir = join(root, "validation", "reports");
const truthPath = join(root, "validation", "fixtures", "person_1280x720_30fps.truth.json");
const fixturePath = join(root, "validation", "fixtures", "person_1280x720_30fps.mp4");
const contractPath = join(root, "packages", "contracts", "src", "schemas", "analysis.ts");
const manifestPath = join(root, "validation", "domain-manifest.json");

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
  ].flatMap((stroke) => ["technique:" + stroke, "footwork:layer:" + stroke]),
  "footwork:pure",
];

function fail(message) {
  console.error("Readiness integrity FAILED: " + message);
  process.exit(1);
}

function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object") {
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  }
  return JSON.stringify(value);
}

function manifestDigest(manifest) {
  const digestInput = canonical({
    policy: manifest.policy || {},
    clips: manifest.clips.map((c) => ({ id: c.id, sha256: c.sha256, truth: c.truth })),
    moduleEvidence: manifest.moduleEvidence || {},
  });
  return createHash("sha256").update(digestInput).digest("hex").toUpperCase();
}

function isDomainReport(report) {
  return (
    report.evidence &&
    Array.isArray(report.evidence.eventClips) &&
    Array.isArray(report.evidence.poseClips)
  );
}

if (!existsSync(seedPath)) fail("missing readiness.seed.json");
if (!existsSync(reportsDir)) fail("missing validation/reports");

const seed = JSON.parse(readFileSync(seedPath, "utf8"));
const truth = existsSync(truthPath) ? JSON.parse(readFileSync(truthPath, "utf8")) : null;
const contractText = readFileSync(contractPath, "utf8");
const contractVersion = contractText.match(/PIPELINE_VERSION\s*=\s*"([^"]+)"/)?.[1];
if (!contractVersion) fail("cannot determine contract pipeline version");
if (seed.pipelineVersion !== contractVersion) {
  fail("seed pipelineVersion=" + seed.pipelineVersion + " contract=" + contractVersion);
}
if (!truth?.sha256 || !existsSync(fixturePath)) fail("fixture hash provenance is missing");
const fixtureSha256 = createHash("sha256").update(readFileSync(fixturePath)).digest("hex").toUpperCase();
if (truth.sha256.toUpperCase() !== fixtureSha256) fail("fixture truth hash does not match the media file");

const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const manifestClips = manifest && Array.isArray(manifest.clips) ? manifest.clips : [];
const clipById = new Map(manifestClips.map((c) => [c.id, c]));
const policy = manifest?.policy || {};
const domainDigest = manifest ? manifestDigest(manifest) : "";

const seedIds = Object.keys(seed.modules || {}).sort();
const expectedIds = [...expectedModules].sort();
if (JSON.stringify(seedIds) !== JSON.stringify(expectedIds)) {
  fail("seed modules do not match the contract inventory");
}

const reports = new Map();
for (const name of readdirSync(reportsDir)) {
  if (!name.endsWith(".json")) continue;
  const report = JSON.parse(readFileSync(join(reportsDir, name), "utf8"));
  if (!report.moduleId) fail(name + " has no moduleId");
  if (!expectedModules.includes(report.moduleId)) fail(report.moduleId + " is not in the module inventory");
  if (reports.has(report.moduleId)) fail("duplicate report for " + report.moduleId);
  reports.set(report.moduleId, report);
  if (report.pipelineVersion !== contractVersion) {
    fail(report.moduleId + " pipelineVersion=" + report.pipelineVersion + " contract=" + contractVersion);
  }

  if (isDomainReport(report)) {
    if (!manifest || manifestClips.length === 0) {
      fail(report.moduleId + " is a domain report but the manifest has no clips");
    }
    if (report.fixtureKind !== "badminton_stroke") {
      fail(report.moduleId + " domain report must declare fixtureKind=badminton_stroke");
    }
    const clipIds = [...report.evidence.eventClips, ...report.evidence.poseClips];
    if (new Set(clipIds).size !== clipIds.length) {
      fail(report.moduleId + " references duplicate manifest clips");
    }
    const stroke = report.moduleId.startsWith("footwork:layer:")
      ? report.moduleId.slice("footwork:layer:".length)
      : report.moduleId.startsWith("technique:")
        ? report.moduleId.slice("technique:".length)
        : null;
    if (report.moduleId === "footwork:pure" && report.evidence.eventClips.length > 0) {
      fail(report.moduleId + " must not declare eventClips");
    }
    for (const kind of ["eventClips", "poseClips"]) {
      for (const clipId of report.evidence[kind]) {
        const clip = clipById.get(clipId);
        if (!clip) fail(report.moduleId + " references unknown manifest clip " + clipId);
        if (clip.truth?.fixtureKind !== "badminton_stroke") {
          fail(report.moduleId + " references non-domain clip " + clipId);
        }
        if (stroke && clip.truth.strokeId !== stroke) {
          fail(report.moduleId + " clip " + clipId + " is for stroke " + clip.truth.strokeId);
        }
        const expectedSource = kind === "eventClips" ? "shuttleset" : "own_capture";
        if (clip.source !== expectedSource) {
          fail(report.moduleId + " clip " + clipId + " source must be " + expectedSource);
        }
      }
    }
    if (report.fixtureSha256?.toUpperCase() !== domainDigest) {
      fail(report.moduleId + " manifest digest provenance is missing or stale");
    }
    if (report.passed) {
      if (!report.evidence.eventPass || !report.evidence.posePass) {
        fail(report.moduleId + " passed but evidence flags are not both true");
      }
      if (report.evidence.eventClips.length < policy.minEventClips) {
        fail(report.moduleId + " passed with fewer event clips than policy requires");
      }
      if (report.evidence.poseClips.length < policy.minPoseClips) {
        fail(report.moduleId + " passed with fewer pose clips than policy requires");
      }
    }
  } else {
    if (report.fixtureSha256?.toUpperCase() !== fixtureSha256) {
      fail(report.moduleId + " fixture hash provenance is missing or stale");
    }
  }

  if (report.passed && report.fixtureKind !== "badminton_stroke") {
    fail(report.moduleId + " passed without fixtureKind=badminton_stroke");
  }
  const notes = (report.notes || []).join(" ");
  if (/synthetic|walking person fixture/i.test(notes)) {
    if (report.passed) fail(report.moduleId + " passed using a non-domain/synthetic fixture");
  }
}

for (const moduleId of expectedModules) {
  const report = reports.get(moduleId);
  if (!report) fail("missing report for " + moduleId);
  const expectedStatus = report.passed ? "on" : "locked";
  if (seed.modules[moduleId] !== expectedStatus) {
    fail(moduleId + " seed=" + seed.modules[moduleId] + " report=" + expectedStatus);
  }
}

const allOn = expectedModules.every((moduleId) => seed.modules[moduleId] === "on");
if (Boolean(seed.complete) !== allOn) {
  fail("seed.complete=" + Boolean(seed.complete) + " does not match module statuses");
}

const domainFixture = truth.fixtureKind === "badminton_stroke";
if (Boolean(seed.complete) && !domainFixture && manifestClips.length === 0) {
  fail("public completeness is claimed without domain evidence (smoke fixture is non_domain_smoke and no domain manifest clips exist)");
}

console.log(
  "Readiness provenance valid. complete=" +
    Boolean(seed.complete) +
    " domainFixture=" +
    domainFixture +
    " domainClips=" +
    manifestClips.length,
);
if (!allOn) {
  console.log("Public completeness is not ready; locked modules remain intentionally visible.");
}
