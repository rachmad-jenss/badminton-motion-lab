import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadTrainingEvaluation } from "./check-training-readiness.mjs";

const LABELS = [
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex").toUpperCase();
}

function writeValidRun(overrides = {}) {
  const dir = mkdtempSync(join(tmpdir(), "bml-training-readiness-"));
  const manifest = JSON.stringify({ manifestVersion: 1, sourceIds: ["own_capture"] });
  const manifestSha256 = sha256(manifest);
  writeFileSync(join(dir, "training-manifest.json"), manifest);
  const checkpoint = {
    checkpointVersion: 1,
    modelId: "bml-technique-stroke-v1",
    featureSchemaVersion: 1,
    featureNames: ["fps"],
    classes: LABELS,
    provenance: {
      trainingManifestSha256: manifestSha256,
      publicEvidence: false,
      heldOutSource: "own_capture_only",
    },
  };
  const checkpointText = JSON.stringify(checkpoint);
  writeFileSync(join(dir, "checkpoint.json"), checkpointText);
  const checkpointSha256 = sha256(checkpointText);
  const samplePrediction = {
    strokeId: "clear",
    contactFrame: 12,
    confidence: 0.8,
    provenance: {
      checkpointSha256,
      publicEvidence: false,
    },
  };
  const metrics = {
    records: 2,
    accuracy: 0.75,
    contactMaeFrames: 1.5,
    confidenceMean: 0.8,
    loss: 0.3,
  };
  const report = {
    reportVersion: 1,
    checkpointPath: "checkpoint.json",
    trainingManifestPath: "training-manifest.json",
    checkpointSha256,
    trainingManifestSha256: manifestSha256,
    modelId: "bml-technique-stroke-v1",
    inferenceContractValid: true,
    requiredOutputs: ["strokeId", "contactFrame", "confidence", "provenance"],
    metrics: { train: metrics, validation: metrics, test: metrics, held_out: metrics },
    heldOutSource: "own_capture",
    heldOutRecords: 2,
    evidenceClass: "own_capture",
    metricGate: { passed: true, minHeldOutAccuracy: 0.5, maxHeldOutContactMae: 3 },
    samplePrediction,
    readiness: "ready",
    sourceIds: ["own_capture"],
    ...overrides,
  };
  const reportPath = join(dir, "evaluation.json");
  writeFileSync(reportPath, JSON.stringify(report));
  return { dir, reportPath, checkpointPath: join(dir, "checkpoint.json") };
}

test("missing evaluation is reported without throwing", () => {
  const result = loadTrainingEvaluation(join(tmpdir(), "bml-no-such-evaluation.json"));

  assert.equal(result.status, "missing");
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /evaluation report missing/);
});

test("checkpoint checksum mismatch is invalid evidence", () => {
  const run = writeValidRun();
  writeFileSync(run.checkpointPath, "tampered");

  const result = loadTrainingEvaluation(run.reportPath);

  assert.equal(result.status, "invalid");
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /checkpoint checksum mismatch/);
});

test("synthetic smoke evidence remains not-ready", () => {
  const run = writeValidRun({
    evidenceClass: "synthetic_smoke",
    heldOutSource: null,
    heldOutRecords: 0,
    metrics: { train: { records: 2, accuracy: 1, contactMaeFrames: 0, confidenceMean: 1, loss: 0 }, validation: { records: 2, accuracy: 1, contactMaeFrames: 0, confidenceMean: 1, loss: 0 }, test: { records: 2, accuracy: 1, contactMaeFrames: 0, confidenceMean: 1, loss: 0 } },
    metricGate: { passed: false },
    readiness: "locked",
  });

  const result = loadTrainingEvaluation(run.reportPath);

  assert.equal(result.status, "not-ready");
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /synthetic/);
});

test("third-party held-out evidence remains not-ready", () => {
  const run = writeValidRun({
    evidenceClass: "third_party",
    heldOutSource: "shuttleset22",
    readiness: "locked",
  });

  const result = loadTrainingEvaluation(run.reportPath);

  assert.equal(result.status, "not-ready");
  assert.equal(result.ready, false);
  assert.match(result.errors.join("\n"), /own_capture/);
});

test("valid own-capture report is ready", () => {
  const run = writeValidRun();

  const result = loadTrainingEvaluation(run.reportPath);

  assert.equal(result.status, "ready");
  assert.equal(result.ready, true);
  assert.deepEqual(result.errors, []);
});
