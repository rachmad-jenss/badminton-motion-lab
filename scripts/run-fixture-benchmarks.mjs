/**
 * Runs fixture benchmarks via a live Local Agent analyze call (real measurements).
 * Writes validation/reports + readiness.seed.json. Never invents synthetic pass scores.
 *
 * Env:
 *   BML_AGENT_URL (default http://127.0.0.1:8787)
 *   BML_FIXTURE_VIDEO (default validation/fixtures/person_1280x720_30fps.mp4)
 *   BML_WRITE_SEED=0 to skip seed write
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const AGENT = process.env.BML_AGENT_URL || "http://127.0.0.1:8787";
const FIXTURE_VIDEO =
  process.env.BML_FIXTURE_VIDEO ||
  join(root, "validation", "fixtures", "person_1280x720_30fps.mp4");
const CONTRACT_PATH = join(root, "packages", "contracts", "src", "schemas", "analysis.ts");

const TECHNIQUE_STROKES = [
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
];

function allModuleIds() {
  const technique = TECHNIQUE_STROKES.map((s) => `technique:${s}`);
  const layers = TECHNIQUE_STROKES.map((s) => `footwork:layer:${s}`);
  return [...technique, "footwork:pure", ...layers];
}

function moduleKind(id) {
  if (id === "footwork:pure") return "footwork_pure";
  if (id.startsWith("footwork:layer:")) return "footwork_layer";
  return "technique_stroke";
}

const GATE = JSON.parse(
  readFileSync(join(root, "validation", "benchmark-configs", "default-gate.json"), "utf8"),
);

function evaluate(kind, report) {
  const gate =
    kind === "technique_stroke"
      ? GATE
      : { ...GATE, requiresRacket: false, requiresShuttle: false };
  const notes = [...(report.notes || [])];
  let passed = report.fixturePassRate >= gate.fixturePassRate;

  if (kind === "technique_stroke" || kind === "footwork_layer") {
    if (report.contactMaeFrames == null || report.contactMaeFrames > gate.contactFrameTolerance) {
      passed = false;
      notes.push("Contact MAE exceeds tolerance or missing");
    }
    if (
      report.proposalConfidenceMean == null ||
      report.proposalConfidenceMean < gate.minProposalConfidence
    ) {
      passed = false;
      notes.push("Proposal confidence below gate");
    }
  }

  if (kind === "technique_stroke") {
    if ((report.racketTrackCoverage ?? 0) < 0.8) {
      passed = false;
      notes.push("Racket track coverage below 0.8");
    }
    if ((report.shuttleTrackCoverage ?? 0) < 0.7) {
      passed = false;
      notes.push("Shuttle track coverage below 0.7");
    }
  }

  if (kind === "footwork_pure" || kind === "footwork_layer") {
    if ((report.courtValidRate ?? 0) < 1) {
      passed = false;
      notes.push("Court calibration not valid on all fixtures");
    }
  }

  if (notes.some((n) => String(n).includes("Baseline synthetic"))) {
    passed = false;
    notes.push("Synthetic baseline notes are forbidden");
  }

  return { ...report, notes, passed, gate };
}

async function agentJson(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${AGENT}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return text ? JSON.parse(text) : {};
}

function contactFromEvents(summary) {
  const events = summary?.events?.events || [];
  const contact = events.find((e) => e.type === "contact" || e.type === "stroke_contact");
  const confs = events.map((e) => e.confidence).filter((c) => typeof c === "number");
  return {
    frameIndex: contact?.frameIndex ?? null,
    confidenceMean: confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null,
  };
}

async function main() {
  if (!existsSync(FIXTURE_VIDEO)) {
    console.error(`Missing fixture video: ${FIXTURE_VIDEO}`);
    process.exit(1);
  }

  const health = await fetch(`${AGENT}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error(`Agent not reachable at ${AGENT}. Start Local Agent, then re-run.`);
    process.exit(1);
  }
  if (typeof health.pairingCode !== "string" || !health.pairingCode) {
    console.error("Agent did not expose a live pairing code; refresh/restart the Local Agent.");
    process.exit(1);
  }
  const contractText = readFileSync(CONTRACT_PATH, "utf8");
  const contractVersion = contractText.match(/PIPELINE_VERSION\s*=\s*"([^"]+)"/)?.[1];
  if (!contractVersion || health.pipelineVersion !== contractVersion) {
    console.error(`Pipeline version provenance mismatch: health=${health.pipelineVersion} contract=${contractVersion}`);
    process.exit(1);
  }
  const fixtureSha256 = createHash("sha256").update(readFileSync(FIXTURE_VIDEO)).digest("hex").toUpperCase();

  const pair = await agentJson("/pair", {
    method: "POST",
    body: { pairing_code: health.pairingCode, device_name: "fixture-benchmark" },
  });
  const token = pair.token;

  // Manual court corners for footwork gate (full-frame quad — valid calibration path)
  const truthPath = join(root, "validation", "fixtures", "person_1280x720_30fps.truth.json");
  const truth = existsSync(truthPath)
    ? JSON.parse(readFileSync(truthPath, "utf8"))
    : {
        fixtureKind: "unknown",
        contactFrameTruth: null,
        courtCorners: [
          { x: 100, y: 200 },
          { x: 1180, y: 200 },
          { x: 1200, y: 700 },
          { x: 80, y: 700 },
        ],
      };

  if (!truth.sha256 || truth.sha256.toUpperCase() !== fixtureSha256) {
    console.error("Fixture truth hash does not match the media file.");
    process.exit(1);
  }
  const domainFixture = truth.fixtureKind === "badminton_stroke";
  if (!domainFixture) {
    console.warn(
      `Fixture ${FIXTURE_VIDEO} is smoke-only (${truth.fixtureKind || "unknown"}); it cannot unlock public badminton modules.`,
    );
  }

  const reg = await agentJson("/captures/register", {
    method: "POST",
    token,
    body: { path: FIXTURE_VIDEO, title: "fixture-person" },
  });

  const analyzedModules = ["technique:clear", "footwork:layer:clear", "footwork:pure"];

  const analyze = await agentJson("/analyze", {
    method: "POST",
    token,
    body: {
      capture_id: reg.captureId,
      modules: analyzedModules,
      stroke_hint: "clear",
      court_corners: truth.courtCorners,
      max_frames: Number(process.env.BML_BENCH_MAX_FRAMES || 90),
      frame_stride: Number(process.env.BML_BENCH_STRIDE || 2),
    },
  });

  const summary = analyze.summary;
  const { frameIndex: proposedContact, confidenceMean } = contactFromEvents(summary);
  const contactMae =
    truth.contactFrameTruth != null && proposedContact != null
      ? Math.abs(proposedContact - truth.contactFrameTruth)
      : null;

  const measured = {
    generatedAt: new Date().toISOString(),
    pipelineVersion: health.pipelineVersion,
    fixtureVideo: relative(root, FIXTURE_VIDEO).replaceAll("\\", "/"),
    fixtureKind: truth.fixtureKind || "unknown",
    fixtureSha256,
    analysisRunId: analyze.analysisRunId,
    contactMaeFrames: contactMae,
    proposalConfidenceMean: confidenceMean,
    fixturePassRate: 0,
    racketTrackCoverage: summary.racketCoverage ?? 0,
    shuttleTrackCoverage: summary.shuttleCoverage ?? 0,
    courtValidRate: summary.court?.valid ? 1 : 0,
    poseDetectionCoverage: summary.pose?.detectionCoverage ?? null,
    notes: [
      `Real agent run ${analyze.analysisRunId}`,
      `Pose adapter ${summary.pose?.adapter || "unknown"}`,
      `Quality ${summary.quality?.passed ? "passed" : "failed"}`,
    ],
  };

  const reportsDir = join(root, "validation", "reports");
  mkdirSync(reportsDir, { recursive: true });

  const modules = {};
  let allPassed = domainFixture;
  const analyzedSet = new Set(analyzedModules);

  for (const moduleId of allModuleIds()) {
    const kind = moduleKind(moduleId);
    const safeName = moduleId.replaceAll(":", "__");
    if (!analyzedSet.has(moduleId)) {
      const locked = {
        moduleId,
        generatedAt: measured.generatedAt,
        pipelineVersion: measured.pipelineVersion,
        fixtureVideo: measured.fixtureVideo,
        fixtureKind: measured.fixtureKind,
        fixtureSha256: measured.fixtureSha256,
        fixturePassRate: 0,
        passed: false,
        notes: [
          `No dedicated fixture run for ${moduleId}`,
          `Only analyzed: ${analyzedModules.join(", ")}`,
        ],
        gate: GATE,
      };
      writeFileSync(join(reportsDir, `${safeName}.json`), JSON.stringify(locked, null, 2));
      modules[moduleId] = "locked";
      allPassed = false;
      console.log(`LOCK ${moduleId} (no dedicated run)`);
      continue;
    }
    const raw = {
      moduleId,
      ...measured,
      fixturePassRate:
        domainFixture &&
        (kind === "footwork_pure"
          ? measured.courtValidRate === 1
          : measured.contactMaeFrames != null &&
            measured.contactMaeFrames <= GATE.contactFrameTolerance)
          ? 1
          : 0,
      contactMaeFrames: kind === "footwork_pure" ? null : measured.contactMaeFrames,
      proposalConfidenceMean: kind === "footwork_pure" ? null : measured.proposalConfidenceMean,
      racketTrackCoverage: kind === "technique_stroke" ? measured.racketTrackCoverage : null,
      shuttleTrackCoverage: kind === "technique_stroke" ? measured.shuttleTrackCoverage : null,
      courtValidRate:
        kind === "footwork_pure" || kind === "footwork_layer" ? measured.courtValidRate : null,
    };
    const report = evaluate(kind, raw);
    if (!report.passed) allPassed = false;
    writeFileSync(join(reportsDir, `${safeName}.json`), JSON.stringify(report, null, 2));
    modules[moduleId] = report.passed ? "on" : "locked";
    console.log(`${report.passed ? "ON " : "LOCK"} ${moduleId}`);
  }

  // Fail hard if any report still has synthetic theater notes
  for (const name of readdirSync(reportsDir)) {
    if (!name.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(reportsDir, name), "utf8"));
    const notes = (data.notes || []).join(" ");
    if (notes.includes("Baseline synthetic")) {
      console.error(`Forbidden synthetic note in ${name}`);
      process.exit(1);
    }
  }

  if (process.env.BML_WRITE_SEED !== "0") {
    const seedPath = join(root, "apps", "web", "src", "lib", "readiness.seed.json");
    mkdirSync(dirname(seedPath), { recursive: true });
    writeFileSync(
      seedPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          pipelineVersion: measured.pipelineVersion,
          complete: allPassed,
          modules,
          source: "agent-fixture-benchmark",
        },
        null,
        2,
      ),
    );
  }

  const digest = createHash("sha256").update(JSON.stringify(modules)).digest("hex").slice(0, 12);
  console.log(`\nReal benchmarks written. complete=${allPassed} digest=${digest}`);
  // Exit 0 for an honest incomplete readiness state; readiness:check remains
  // the strict release gate and integrity prevents false completeness claims.
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
