/**
 * Runs domain-valid fixture benchmarks through a live Local Agent analyze call.
 *
 * Reads validation/domain-manifest.json (or BML_DOMAIN_MANIFEST). Every clip
 * carries truth (stroke, hand, contact frame, court corners) and a SHA-256.
 * A module unlocks only when BOTH evidence kinds pass (Plan 028, Q14):
 *   - event evidence (ShuttleSet clips): contact-frame MAE + proposal confidence
 *   - pose evidence (own-capture clips): racket/shuttle coverage + contact MAE
 * Footwork modules additionally require court validity on every pose clip.
 *
 * Never invents pass scores: clips whose truth.fixtureKind is not
 * badminton_stroke cannot contribute, and an empty manifest is a no-op
 * (exit 0) so CI can always run this script.
 *
 * Env:
 *   BML_AGENT_URL (default http://127.0.0.1:8787)
 *   BML_DOMAIN_MANIFEST (default validation/domain-manifest.json)
 *   BML_WRITE_SEED=0 to skip seed write
 *   BML_BENCH_MAX_FRAMES / BML_BENCH_STRIDE (per-clip analysis caps)
 */
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { TECHNIQUE_STROKES, allModuleIds, moduleKind } from "./module-inventory.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const AGENT = process.env.BML_AGENT_URL || "http://127.0.0.1:8787";
const MANIFEST_PATH =
  process.env.BML_DOMAIN_MANIFEST || join(root, "validation", "domain-manifest.json");
const CONTRACT_PATH = join(root, "packages", "contracts", "src", "schemas", "analysis.ts");

function fail(message) {
  console.error("Domain benchmark FAILED: " + message);
  process.exit(1);
}

function loadManifest() {
  if (!existsSync(MANIFEST_PATH)) fail("missing manifest: " + MANIFEST_PATH);
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  if (!Array.isArray(manifest.clips)) fail("manifest.clips must be an array");
  const ids = new Set();
  for (const clip of manifest.clips) {
    for (const field of ["id", "source", "path", "sha256", "fps", "truth"]) {
      if (clip[field] == null) fail("clip is missing " + field + ": " + JSON.stringify(clip).slice(0, 140));
    }
    if (!["shuttleset", "own_capture"].includes(clip.source)) {
      fail("clip " + clip.id + " has invalid source " + clip.source);
    }
    if (!/^[0-9A-Fa-f]{64}$/.test(clip.sha256)) {
      fail("clip " + clip.id + " sha256 must be 64 hex chars");
    }
    const t = clip.truth;
    if (!t || t.fixtureKind !== "badminton_stroke") {
      fail("clip " + clip.id + " truth.fixtureKind must be badminton_stroke (no fabricated evidence)");
    }
    if (!TECHNIQUE_STROKES.includes(t.strokeId)) {
      fail("clip " + clip.id + " truth.strokeId " + t.strokeId + " is not in the stroke inventory");
    }
    if (!Array.isArray(t.courtCorners) || t.courtCorners.length !== 4) {
      fail("clip " + clip.id + " truth.courtCorners must have exactly 4 corners");
    }
    if (ids.has(clip.id)) fail("duplicate clip id " + clip.id);
    ids.add(clip.id);
  }
  const policy = {
    minEventClips: manifest.policy?.minEventClips ?? Number(process.env.BML_DOMAIN_MIN_CLIPS || 3),
    minPoseClips: manifest.policy?.minPoseClips ?? Number(process.env.BML_DOMAIN_MIN_CLIPS || 3),
    publicMinClips: manifest.policy?.publicMinClips ?? Number(process.env.BML_DOMAIN_PUBLIC_MIN_CLIPS || 5),
  };
  const moduleEvidence = manifest.moduleEvidence || {};
  const clipById = new Map(manifest.clips.map((c) => [c.id, c]));
  for (const [moduleId, ev] of Object.entries(moduleEvidence)) {
    if (!allModuleIds().includes(moduleId)) {
      fail("moduleEvidence key " + moduleId + " is not in the module inventory");
    }
    const stroke = moduleId.startsWith("footwork:layer:")
      ? moduleId.slice("footwork:layer:".length)
      : moduleId.startsWith("technique:")
        ? moduleId.slice("technique:".length)
        : null;
    for (const kind of ["eventClips", "poseClips"]) {
      const list = ev[kind] || [];
      if (new Set(list).size !== list.length) {
        fail("moduleEvidence " + moduleId + "." + kind + " contains duplicate clip ids");
      }
      for (const clipId of list) {
        const clip = clipById.get(clipId);
        if (!clip) fail("moduleEvidence " + moduleId + "." + kind + " references unknown clip " + clipId);
        if (stroke && clip.truth.strokeId !== stroke) {
          fail("moduleEvidence " + moduleId + "." + kind + " clip " + clipId + " is for stroke " + clip.truth.strokeId);
        }
        const expectedSource = kind === "eventClips" ? "shuttleset" : "own_capture";
        if (clip.source !== expectedSource) {
          fail("moduleEvidence " + moduleId + "." + kind + " clip " + clipId + " source must be " + expectedSource);
        }
      }
    }
    if (moduleId === "footwork:pure" && (ev.eventClips?.length || 0) > 0) {
      fail("moduleEvidence footwork:pure must not declare eventClips");
    }
  }
  return { manifest, policy, moduleEvidence };
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

const GATE = JSON.parse(
  readFileSync(join(root, "validation", "benchmark-configs", "default-gate.json"), "utf8"),
);

async function agentJson(path, { method = "GET", body, token } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(AGENT + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(method + " " + path + " -> " + res.status + ": " + text.slice(0, 300));
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

async function analyzeClip(clip, token) {
  const abs = join(root, clip.path);
  if (!existsSync(abs)) {
    fail("domain clip media missing: " + clip.path + " (keep media in gitignored validation/domain-media/)");
  }
  const sha = createHash("sha256").update(readFileSync(abs)).digest("hex").toUpperCase();
  if (sha !== clip.sha256.toUpperCase()) {
    fail("domain clip hash mismatch for " + clip.id + "; update the manifest sha256");
  }
  const reg = await agentJson("/captures/register", {
    method: "POST",
    token,
    body: { path: abs, title: "domain-" + clip.id },
  });
  const modules = [
    "technique:" + clip.truth.strokeId,
    "footwork:layer:" + clip.truth.strokeId,
    "footwork:pure",
  ];
  const analyze = await agentJson("/analyze", {
    method: "POST",
    token,
    body: {
      capture_id: reg.captureId,
      modules,
      stroke_hint: clip.truth.strokeId,
      court_corners: clip.truth.courtCorners,
      max_frames: Number(process.env.BML_BENCH_MAX_FRAMES || 90),
      frame_stride: Number(process.env.BML_BENCH_STRIDE || 2),
    },
  });
  const summary = analyze.summary || {};
  const { frameIndex, confidenceMean } = contactFromEvents(summary);
  return {
    clipId: clip.id,
    source: clip.source,
    strokeId: clip.truth.strokeId,
    contactMaeFrames:
      clip.truth.contactFrameTruth != null && frameIndex != null
        ? Math.abs(frameIndex - clip.truth.contactFrameTruth)
        : null,
    confidenceMean,
    racketCoverage: summary.racketCoverage ?? 0,
    shuttleCoverage: summary.shuttleCoverage ?? 0,
    courtValid: summary.court?.valid ? 1 : 0,
    poseCoverage: summary.pose?.detectionCoverage ?? null,
    analysisRunId: analyze.analysisRunId,
    error: null,
  };
}

function evaluateModule(moduleId, kind, results, policy) {
  const byId = new Map(results.map((r) => [r.clipId, r]));
  const ev = moduleEvidence[moduleId] || { eventClips: [], poseClips: [] };
  const uniqueEvent = [...new Set(ev.eventClips)];
  const uniquePose = [...new Set(ev.poseClips)];
  const eventClips = uniqueEvent.map((id) => byId.get(id)).filter(Boolean);
  const poseClips = uniquePose.map((id) => byId.get(id)).filter(Boolean);
  const notes = [];
  const meanConf = (clips) => {
    const confs = clips.map((c) => c.confidenceMean).filter((v) => typeof v === "number");
    return confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : null;
  };
  const maxMae = (clips) => {
    const maes = clips.map((c) => c.contactMaeFrames).filter((v) => typeof v === "number");
    return maes.length ? Math.max(...maes) : null;
  };
  const minCoverage = (clips, key) => {
    const values = clips.map((c) => c[key]).filter((v) => typeof v === "number");
    return values.length ? Math.min(...values) : null;
  };
  const courtValidRate = (clips) =>
    clips.length ? clips.reduce((a, c) => a + (c.error ? 0 : c.courtValid), 0) / clips.length : null;
  const noErrors = (clips) => clips.every((c) => !c.error);

  let eventPass = true;
  let posePass = true;

  if (kind === "technique_stroke" || kind === "footwork_layer") {
    if (eventClips.length < policy.minEventClips) {
      eventPass = false;
      notes.push("Event evidence needs >= " + policy.minEventClips + " clips; found " + eventClips.length);
    } else if (!noErrors(eventClips)) {
      eventPass = false;
      notes.push("Event clips include analysis failures");
    } else {
      const mae = maxMae(eventClips);
      const conf = meanConf(eventClips);
      if (mae == null || mae > GATE.contactFrameTolerance) {
        eventPass = false;
        notes.push("Contact MAE " + (mae ?? "missing") + " exceeds tolerance " + GATE.contactFrameTolerance);
      }
      if (conf == null || conf < GATE.minProposalConfidence) {
        eventPass = false;
        notes.push("Proposal confidence " + (conf ?? "missing") + " below " + GATE.minProposalConfidence);
      }
    }
  }

  if (kind === "technique_stroke") {
    if (poseClips.length < policy.minPoseClips) {
      posePass = false;
      notes.push("Pose evidence needs >= " + policy.minPoseClips + " clips; found " + poseClips.length);
    } else if (!noErrors(poseClips)) {
      posePass = false;
      notes.push("Pose clips include analysis failures");
    } else {
      const mae = maxMae(poseClips);
      const conf = meanConf(poseClips);
      const racket = minCoverage(poseClips, "racketCoverage");
      const shuttle = minCoverage(poseClips, "shuttleCoverage");
      if (mae == null || mae > GATE.contactFrameTolerance) {
        posePass = false;
        notes.push("Pose contact MAE " + (mae ?? "missing") + " exceeds tolerance " + GATE.contactFrameTolerance);
      }
      if (conf == null || conf < GATE.minProposalConfidence) {
        posePass = false;
        notes.push("Pose confidence " + (conf ?? "missing") + " below " + GATE.minProposalConfidence);
      }
      if (racket == null || racket < 0.8) {
        posePass = false;
        notes.push("Racket track coverage " + (racket ?? "missing") + " below 0.8");
      }
      if (shuttle == null || shuttle < 0.7) {
        posePass = false;
        notes.push("Shuttle track coverage " + (shuttle ?? "missing") + " below 0.7");
      }
    }
  }

  if (kind === "footwork_pure" || kind === "footwork_layer") {
    if (poseClips.length < policy.minPoseClips) {
      posePass = false;
      notes.push("Pose evidence needs >= " + policy.minPoseClips + " clips; found " + poseClips.length);
    } else if (!noErrors(poseClips)) {
      posePass = false;
      notes.push("Pose clips include analysis failures");
    } else if (courtValidRate(poseClips) !== 1) {
      posePass = false;
      notes.push("Court calibration not valid on all pose clips (" + courtValidRate(poseClips) + ")");
    }
  }

  const totalClips = eventClips.length + poseClips.length;
  const passed = eventPass && posePass;
  const policyObj = {
    ...policy,
    contactFrameTolerance: GATE.contactFrameTolerance,
    minProposalConfidence: GATE.minProposalConfidence,
  };
  return {
    evidence: {
      eventClips: uniqueEvent,
      poseClips: uniquePose,
      eventPass,
      posePass,
      policy: policyObj,
    },
    clipResults: [...eventClips, ...poseClips].map((c) => ({
      clipId: c.clipId,
      source: c.source,
      contactMaeFrames: c.contactMaeFrames,
      confidenceMean: c.confidenceMean,
      racketCoverage: c.racketCoverage,
      shuttleCoverage: c.shuttleCoverage,
      courtValid: c.courtValid,
      poseCoverage: c.poseCoverage,
      analysisRunId: c.analysisRunId,
      error: c.error,
    })),
    aggregate: {
      contactMaeFrames: maxMae([...eventClips, ...poseClips]),
      proposalConfidenceMean: meanConf([...eventClips, ...poseClips]),
      racketTrackCoverage: kind === "technique_stroke" ? minCoverage(poseClips, "racketCoverage") : null,
      shuttleTrackCoverage: kind === "technique_stroke" ? minCoverage(poseClips, "shuttleCoverage") : null,
      courtValidRate: courtValidRate(poseClips),
      poseDetectionCoverage: minCoverage([...eventClips, ...poseClips], "poseCoverage"),
      fixturePassRate: totalClips ? (passed ? totalClips : 0) / totalClips : 0,
    },
    passed,
    notes,
    gate: { ...GATE, policy: policyObj },
  };
}

async function main() {
  const ciSmoke = process.argv.includes("--ci-smoke");
  const { manifest, policy, moduleEvidence } = loadManifest();
  if (!manifest.clips.length) {
    console.log("No domain clips in manifest; nothing to benchmark (honest locked state).");
    process.exit(0);
  }
  if (ciSmoke) {
    const missing = manifest.clips.filter((c) => !existsSync(join(root, c.path)));
    if (missing.length) {
      console.log(
        "CI smoke: domain media is not provisioned on this runner (" +
          missing.length +
          " clip(s) missing); skipping the real benchmark. Run it on the maintainer machine with media present.",
      );
      process.exit(0);
    }
  }

  const health = await fetch(AGENT + "/health").then((r) => r.json()).catch(() => null);
  if (!health?.ok) fail("agent not reachable at " + AGENT + "; start Local Agent and re-run");
  if (typeof health.pairingCode !== "string" || !health.pairingCode) {
    fail("agent did not expose a live pairing code; refresh/restart the Local Agent");
  }
  const contractText = readFileSync(CONTRACT_PATH, "utf8");
  const contractVersion = contractText.match(/PIPELINE_VERSION\s*=\s*"([^"]+)"/)?.[1];
  if (!contractVersion || health.pipelineVersion !== contractVersion) {
    fail("pipeline version provenance mismatch: health=" + health.pipelineVersion + " contract=" + contractVersion);
  }

  const pair = await agentJson("/pair", {
    method: "POST",
    body: { pairing_code: health.pairingCode, device_name: "domain-benchmark" },
  });
  const token = pair.token;

  const results = [];
  for (const clip of manifest.clips) {
    try {
      results.push(await analyzeClip(clip, token));
      console.log("ANALYZED " + clip.id + " (" + clip.source + ", " + clip.truth.strokeId + ")");
    } catch (e) {
      console.error("ANALYZE FAILED " + clip.id + ": " + e.message);
      results.push({
        clipId: clip.id,
        source: clip.source,
        strokeId: clip.truth.strokeId,
        contactMaeFrames: null,
        confidenceMean: null,
        racketCoverage: 0,
        shuttleCoverage: 0,
        courtValid: 0,
        poseCoverage: null,
        analysisRunId: null,
        error: e.message,
      });
    }
  }

  const generatedAt = new Date().toISOString();
  const digest = manifestDigest(manifest);
  const reportsDir = join(root, "validation", "reports");
  mkdirSync(reportsDir, { recursive: true });
  const modules = {};
  let allPassed = true;

  for (const moduleId of allModuleIds()) {
    const kind = moduleKind(moduleId);
    const safeName = moduleId.replaceAll(":", "__");
    const ev = moduleEvidence[moduleId] || { eventClips: [], poseClips: [] };
    const hasEvidence = ev.eventClips?.length || ev.poseClips?.length;
    if (!hasEvidence) {
      const locked = {
        moduleId,
        generatedAt,
        pipelineVersion: health.pipelineVersion,
        fixtureVideo: "validation/domain-manifest.json",
        fixtureKind: "badminton_stroke",
        fixtureSha256: digest,
        fixturePassRate: 0,
        passed: false,
        evidence: { eventClips: [], poseClips: [], eventPass: false, posePass: false, policy },
        notes: ["No domain evidence declared for " + moduleId],
        gate: { ...GATE, policy },
      };
      writeFileSync(join(reportsDir, safeName + ".json"), JSON.stringify(locked, null, 2));
      modules[moduleId] = "locked";
      allPassed = false;
      console.log("LOCK " + moduleId + " (no evidence)");
      continue;
    }
    const evaluated = evaluateModule(moduleId, kind, results, policy);
    const report = {
      moduleId,
      generatedAt,
      pipelineVersion: health.pipelineVersion,
      fixtureVideo: "validation/domain-manifest.json",
      fixtureKind: "badminton_stroke",
      fixtureSha256: digest,
      analysisRunIds: evaluated.clipResults.map((c) => c.analysisRunId).filter(Boolean),
      contactMaeFrames: kind === "footwork_pure" ? null : evaluated.aggregate.contactMaeFrames,
      proposalConfidenceMean: kind === "footwork_pure" ? null : evaluated.aggregate.proposalConfidenceMean,
      fixturePassRate: evaluated.aggregate.fixturePassRate,
      racketTrackCoverage: evaluated.aggregate.racketTrackCoverage,
      shuttleTrackCoverage: evaluated.aggregate.shuttleTrackCoverage,
      courtValidRate: evaluated.aggregate.courtValidRate,
      poseDetectionCoverage: evaluated.aggregate.poseDetectionCoverage,
      evidence: evaluated.evidence,
      clipResults: evaluated.clipResults,
      passed: evaluated.passed,
      notes: [
        "Real agent domain runs",
        "Evidence manifest " + relative(root, MANIFEST_PATH).replaceAll("\\", "/"),
        ...evaluated.notes,
      ],
      gate: evaluated.gate,
    };
    writeFileSync(join(reportsDir, safeName + ".json"), JSON.stringify(report, null, 2));
    modules[moduleId] = evaluated.passed ? "on" : "locked";
    if (!evaluated.passed) allPassed = false;
    console.log((evaluated.passed ? "ON " : "LOCK") + " " + moduleId);
  }

  for (const name of readdirSync(reportsDir)) {
    if (!name.endsWith(".json")) continue;
    const data = JSON.parse(readFileSync(join(reportsDir, name), "utf8"));
    const notes = (data.notes || []).join(" ");
    if (notes.includes("Baseline synthetic")) {
      fail("forbidden synthetic note in " + name);
    }
  }

  if (process.env.BML_WRITE_SEED !== "0") {
    const seedPath = join(root, "apps", "web", "src", "lib", "readiness.seed.json");
    mkdirSync(dirname(seedPath), { recursive: true });
    writeFileSync(
      seedPath,
      JSON.stringify(
        {
          generatedAt,
          pipelineVersion: health.pipelineVersion,
          complete: allPassed,
          modules,
          source: "domain-manifest-benchmark",
        },
        null,
        2,
      ),
    );
  }

  console.log("\nDomain benchmarks written. complete=" + allPassed + " digest=" + digest.slice(0, 12));
  process.exitCode = 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
