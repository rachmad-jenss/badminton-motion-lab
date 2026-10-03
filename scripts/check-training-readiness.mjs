/**
 * Validate local training evidence without treating adapters or smoke runs as
 * public readiness evidence.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TRAINING_CHECKPOINT_CONTRACT } from "./training-adapters.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const derivedRoot = join(root, "validation", "training-derived");
const REQUIRED_METRICS = [
  "records",
  "accuracy",
  "macroF1",
  "macroF1AllClasses",
  "contactMaeFrames",
  "contactMaeRelative",
  "confidenceMean",
  "loss",
];
const STROKE_IDS = new Set([
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
]);

export function loadTrainingEvaluation(requestedPath) {
  const reportPath = resolveEvaluationPath(requestedPath);
  if (!reportPath || !existsSync(reportPath)) {
    return {
      status: "missing",
      ready: false,
      errors: ["training evaluation report missing"],
      report: null,
      evaluationPath: reportPath,
    };
  }

  let report;
  try {
    report = JSON.parse(readFileSync(reportPath, "utf8"));
  } catch (error) {
    return {
      status: "invalid",
      ready: false,
      errors: ["training evaluation report is not valid JSON: " + error.message],
      report: null,
      evaluationPath: reportPath,
    };
  }

  const invalid = [];
  const notReady = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    invalid.push("training evaluation report must be an object");
    return result("invalid", invalid, report, reportPath);
  }
  if (report.reportVersion !== 1) invalid.push("reportVersion must be 1");
  if (report.modelId !== TRAINING_CHECKPOINT_CONTRACT.modelId) {
    invalid.push("evaluation modelId does not match the checkpoint contract");
  }
  if (report.inferenceContractValid !== true) {
    invalid.push("inferenceContractValid must be true");
  }
  if (!sameStrings(report.requiredOutputs, TRAINING_CHECKPOINT_CONTRACT.requiredOutputs)) {
    invalid.push("requiredOutputs do not match the checkpoint contract");
  }

  const checkpointPath = artifactPath(reportPath, report.checkpointPath, "checkpointPath", invalid);
  const manifestPath = artifactPath(
    reportPath,
    report.trainingManifestPath,
    "trainingManifestPath",
    invalid,
  );
  let checkpoint = null;
  if (checkpointPath && existsSync(checkpointPath)) {
    let checkpointBytes;
    try {
      checkpointBytes = readFileSync(checkpointPath);
      checkpoint = JSON.parse(checkpointBytes.toString("utf8"));
    } catch (error) {
      invalid.push("checkpoint is not valid JSON: " + error.message);
    }
    if (checkpointBytes && /^[0-9A-Fa-f]{64}$/.test(String(report.checkpointSha256 || ""))) {
      const actual = sha256(checkpointBytes);
      if (actual !== String(report.checkpointSha256).toUpperCase()) {
        invalid.push("checkpoint checksum mismatch");
      }
    } else {
      invalid.push("checkpointSha256 must be a 64-character checksum");
    }
  } else if (checkpointPath) {
    invalid.push("checkpoint file missing");
  }

  if (manifestPath && existsSync(manifestPath)) {
    const manifestBytes = readFileSync(manifestPath);
    const actual = sha256(manifestBytes);
    if (actual !== String(report.trainingManifestSha256 || "").toUpperCase()) {
      invalid.push("training manifest checksum mismatch");
    }
  } else if (manifestPath) {
    invalid.push("training manifest file missing");
  }

  validateCheckpoint(checkpoint, report, invalid);
  validateMetrics(report.metrics, invalid, notReady);
  validateEvidence(report, notReady);

  if (invalid.length > 0) return result("invalid", [...invalid, ...notReady], report, reportPath);
  if (notReady.length > 0) return result("not-ready", notReady, report, reportPath);
  return result("ready", [], report, reportPath);
}

function resolveEvaluationPath(requestedPath) {
  if (requestedPath) {
    const candidate = resolve(String(requestedPath));
    return isDirectory(candidate) ? join(candidate, "evaluation.json") : candidate;
  }
  const configured = process.env.BML_TRAINING_EVALUATION?.trim();
  if (configured) {
    const candidate = resolve(root, configured);
    return isDirectory(candidate) ? join(candidate, "evaluation.json") : candidate;
  }
  if (existsSync(join(derivedRoot, "evaluation.json"))) return join(derivedRoot, "evaluation.json");
  if (!existsSync(derivedRoot)) return null;
  const candidates = readdirSync(derivedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => join(derivedRoot, entry.name, "evaluation.json"))
    .filter((candidate) => existsSync(candidate))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
  return candidates[0] || null;
}

function artifactPath(reportPath, value, field, errors) {
  if (typeof value !== "string" || value.length === 0) {
    errors.push(field + " is required");
    return null;
  }
  const reportDir = dirname(reportPath);
  const candidate = resolve(reportDir, value);
  const escape = relative(reportDir, candidate);
  if (escape === ".." || escape.startsWith("..\\") || escape.startsWith("../")) {
    errors.push(field + " must stay beside the evaluation report");
    return null;
  }
  return candidate;
}

function validateCheckpoint(checkpoint, report, errors) {
  if (!checkpoint || typeof checkpoint !== "object" || Array.isArray(checkpoint)) {
    errors.push("checkpoint contract is missing");
    return;
  }
  if (checkpoint.checkpointVersion !== TRAINING_CHECKPOINT_CONTRACT.version) {
    errors.push("checkpoint contract version mismatch");
  }
  if (checkpoint.modelId !== TRAINING_CHECKPOINT_CONTRACT.modelId) {
    errors.push("checkpoint modelId mismatch");
  }
  if (checkpoint.featureSchemaVersion !== TRAINING_CHECKPOINT_CONTRACT.featureSchemaVersion) {
    errors.push("checkpoint feature schema version mismatch");
  }
  if (checkpoint.targetNormalization?.representation !== "relative_window") {
    errors.push("checkpoint contact target must use relative_window representation");
  }
  if (!Array.isArray(checkpoint.classes) || !checkpoint.classes.some((id) => STROKE_IDS.has(id))) {
    errors.push("checkpoint class taxonomy is missing");
  }
  const provenance = checkpoint.provenance;
  if (!provenance || provenance.publicEvidence !== false) {
    errors.push("checkpoint provenance must set publicEvidence=false");
  }
  if (provenance?.trainingManifestSha256 !== report.trainingManifestSha256) {
    errors.push("checkpoint training-manifest provenance mismatch");
  }

  const prediction = report.samplePrediction;
  if (!prediction || typeof prediction !== "object") {
    errors.push("samplePrediction is missing");
    return;
  }
  for (const field of TRAINING_CHECKPOINT_CONTRACT.requiredOutputs) {
    if (!(field in prediction)) errors.push("samplePrediction missing " + field);
  }
  if (!STROKE_IDS.has(prediction.strokeId)) errors.push("samplePrediction strokeId is invalid");
  if (!Number.isInteger(prediction.contactFrame) || prediction.contactFrame < 0) {
    errors.push("samplePrediction contactFrame is invalid");
  }
  if (!Number.isFinite(prediction.confidence) || prediction.confidence < 0 || prediction.confidence > 1) {
    errors.push("samplePrediction confidence is invalid");
  }
  if (prediction.provenance?.checkpointSha256 !== report.checkpointSha256) {
    errors.push("samplePrediction checkpoint provenance mismatch");
  }
  if (prediction.provenance?.publicEvidence !== false) {
    errors.push("samplePrediction provenance must set publicEvidence=false");
  }
  if (
    !Number.isFinite(prediction.contactFrameRelative) ||
    prediction.contactFrameRelative < 0 ||
    prediction.contactFrameRelative > 1
  ) {
    errors.push("samplePrediction contactFrameRelative must be between 0 and 1");
  }
}

function validateMetrics(metrics, invalid, notReady) {
  if (!metrics || typeof metrics !== "object") {
    invalid.push("metrics are missing");
    return;
  }
  for (const split of ["train", "validation", "test"]) {
    const metric = metrics[split];
    if (!metric || typeof metric !== "object") {
      invalid.push("metrics." + split + " is missing");
      continue;
    }
    for (const field of REQUIRED_METRICS) {
      if (!Number.isFinite(metric[field])) invalid.push("metrics." + split + "." + field + " must be finite");
    }
    if (!Number.isInteger(metric.records) || metric.records < 1) {
      invalid.push("metrics." + split + ".records must be positive");
    }
    const confusion = metric.confusionMatrix;
    if (
      !confusion ||
      !Array.isArray(confusion.labels) ||
      confusion.labels.length !== STROKE_IDS.size ||
      !Array.isArray(confusion.matrix) ||
      confusion.matrix.length !== STROKE_IDS.size ||
      confusion.matrix.some((row) => !Array.isArray(row) || row.length !== STROKE_IDS.size)
    ) {
      invalid.push("metrics." + split + ".confusionMatrix must be a square stroke matrix");
    }
  }
  if (metrics.held_out && typeof metrics.held_out === "object") {
    for (const field of REQUIRED_METRICS) {
      if (!Number.isFinite(metrics.held_out[field])) {
        notReady.push("held-out metric " + field + " is missing or non-finite");
      }
    }
    if (!Number.isInteger(metrics.held_out.records) || metrics.held_out.records < 1) {
      notReady.push("held-out metric records must be positive");
    }
  } else {
    notReady.push("held-out metrics are missing");
  }
}

function validateEvidence(report, errors) {
  if (report.evidenceClass !== "own_capture") {
    errors.push("evidence class is not own_capture (synthetic and third-party evidence cannot unlock readiness)");
  }
  if (report.heldOutSource !== TRAINING_CHECKPOINT_CONTRACT.heldOutSource) {
    errors.push("held-out source must be own_capture");
  }
  if (!Number.isInteger(report.heldOutRecords) || report.heldOutRecords < 1) {
    errors.push("heldOutRecords must be positive");
  }
  if (report.metricGate?.passed !== true) errors.push("configured held-out metric gate did not pass");
  if (report.readiness !== "ready") errors.push("evaluation readiness is not ready");
  if (!Array.isArray(report.sourceIds) || !report.sourceIds.includes("own_capture")) {
    errors.push("sourceIds must include own_capture");
  }
  if (Array.isArray(report.provenance)) {
    for (const source of report.provenance) {
      if (source?.publicEvidence !== false) {
        errors.push("training provenance contains public evidence");
        break;
      }
    }
  }
}

function result(status, errors, report, evaluationPath) {
  return { status, ready: status === "ready", errors, report, evaluationPath };
}

function sameStrings(left, right) {
  return Array.isArray(left) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

function isDirectory(path) {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function runCli() {
  const result = loadTrainingEvaluation();
  console.log("Training evidence: " + result.status);
  for (const error of result.errors) console.log("- " + error);
  process.exitCode = result.ready ? 0 : 1;
}

if (resolve(process.argv[1] || "") === resolve(fileURLToPath(import.meta.url))) runCli();
