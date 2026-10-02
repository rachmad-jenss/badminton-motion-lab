import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const root = resolve(dirname(scriptPath), "..");
const defaultManifestPath = join(root, "validation", "training-sources.json");
const requiredSourceIds = ["bfmd", "bst", "shuttleset", "shuttleset22", "racketvision"];
const mediaPolicies = new Set(["no_redistribution", "provenance_review_required"]);

export function validateTrainingSourceManifest(manifest) {
  const errors = [];
  const policy = manifest?.policy;
  const sources = Array.isArray(manifest?.sources) ? manifest.sources : [];

  if (manifest?.manifestVersion !== 1) {
    errors.push("manifestVersion must be 1");
  }
  if (!policy || typeof policy !== "object") {
    errors.push("policy is required");
  } else {
    if (policy.localRoot !== "validation/training-sources") {
      errors.push("policy.localRoot must be validation/training-sources");
    }
    if (policy.derivedRoot !== "validation/training-derived") {
      errors.push("policy.derivedRoot must be validation/training-derived");
    }
    if (policy.downloadMode !== "manual") {
      errors.push("policy.downloadMode must be manual");
    }
    if (policy.maxInFlightSources !== 1) {
      errors.push("policy.maxInFlightSources must be 1 to keep preparation bounded");
    }
    if (!Number.isInteger(policy.maxRecordsPerRun) || policy.maxRecordsPerRun < 1) {
      errors.push("policy.maxRecordsPerRun must be a positive integer");
    }
    if (policy.publicEvidenceRule !== "own_capture_only") {
      errors.push("policy.publicEvidenceRule must be own_capture_only");
    }
  }

  if (!Array.isArray(manifest?.sources)) {
    errors.push("sources must be an array");
  }

  const ids = new Set();
  for (const source of sources) {
    if (!source || typeof source !== "object") {
      errors.push("each source must be an object");
      continue;
    }
    const id = source.id;
    if (typeof id !== "string" || id.length === 0) {
      errors.push("source id must be a non-empty string");
      continue;
    }
    if (ids.has(id)) errors.push("duplicate source id: " + id);
    ids.add(id);
    if (!requiredSourceIds.includes(id)) errors.push("unknown source id: " + id);

    for (const field of ["kind", "adapter", "codeLicense", "dataLicense", "mediaPolicy", "localRoot", "attribution"]) {
      if (typeof source[field] !== "string" || source[field].length === 0) {
        errors.push(id + " requires a non-empty " + field);
      }
    }
    for (const field of ["repositoryUrl", "datasetUrl"]) {
      if (typeof source[field] !== "string" || !source[field].startsWith("https://")) {
        errors.push(id + " requires an https " + field);
      }
    }
    if (!Array.isArray(source.roles) || source.roles.length === 0) {
      errors.push(id + " requires at least one role");
    }
    if (typeof source.publicEvidence !== "boolean") {
      errors.push(id + ".publicEvidence must be boolean");
    }
    if (source.publicEvidence === true && mediaPolicies.has(source.mediaPolicy)) {
      errors.push(id + " cannot be marked publicEvidence with mediaPolicy=" + source.mediaPolicy);
    }
    if (typeof source.localRoot === "string" && policy?.localRoot === "validation/training-sources") {
      const expectedLocalRoot = "validation/training-sources/" + id;
      if (source.localRoot.replaceAll("\\", "/") !== expectedLocalRoot) {
        errors.push(id + ".localRoot must be exactly " + expectedLocalRoot);
      }
      const allowedRoot = resolve(root, policy.localRoot);
      const resolvedSourceRoot = resolve(root, source.localRoot);
      const escape = relative(allowedRoot, resolvedSourceRoot);
      if (escape === ".." || escape.startsWith(".." + sep) || resolve(escape) === escape) {
        errors.push(id + ".localRoot escapes policy.localRoot");
      }
    }
  }

  for (const id of requiredSourceIds) {
    if (!ids.has(id)) errors.push("missing required source: " + id);
  }

  return { errors, sources };
}

export function loadTrainingSourceManifest(manifestPath = defaultManifestPath) {
  if (!existsSync(manifestPath)) {
    return { manifest: null, errors: ["missing manifest: " + manifestPath], sources: [] };
  }
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const result = validateTrainingSourceManifest(manifest);
    return { manifest, ...result };
  } catch (error) {
    return {
      manifest: null,
      errors: ["invalid training source manifest: " + error.message],
      sources: [],
    };
  }
}

function runCli() {
  const result = loadTrainingSourceManifest();
  if (result.errors.length > 0) {
    console.error("Training source manifest FAILED:");
    for (const error of result.errors) console.error("- " + error);
    process.exitCode = 1;
    return;
  }
  console.log("Training source manifest valid: " + result.sources.length + " sources");
  for (const source of result.sources) {
    console.log("- " + source.id + " (" + source.adapter + ", " + source.mediaPolicy + ")");
  }
}

if (resolve(process.argv[1] || "") === scriptPath) runCli();
