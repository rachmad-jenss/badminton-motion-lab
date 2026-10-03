import test from "node:test";
import assert from "node:assert/strict";
import {
  SOURCE_ADAPTER_CONTRACTS,
  TRAINING_CHECKPOINT_CONTRACT,
  normalizeTrainingRecord,
} from "./training-adapters.mjs";

test("exposes an explicit adapter contract for every selected source", () => {
  assert.deepEqual(Object.keys(SOURCE_ADAPTER_CONTRACTS), [
    "bfmd",
    "bst",
    "shuttleset",
    "shuttleset22",
    "racketvision",
  ]);
  for (const contract of Object.values(SOURCE_ADAPTER_CONTRACTS)) {
    assert.match(contract.adapter, /-v1$/);
    assert.ok(contract.roles.length > 0);
    assert.equal(contract.publicEvidence, false);
    assert.equal(contract.heldOutPolicy, "own_capture_only");
  }
});

test("normalizes ShuttleSet and ShuttleSet22 tactical fields into one record", () => {
  const result = normalizeTrainingRecord(
    "shuttleset22",
    {
      match: "match-1",
      set: 2,
      rally: 4,
      ball_round: 3,
      frame_num: 42,
      window_start_frame: 22,
      window_end_frame: 62,
      type: "smash",
      player_location_x: 0.4,
      player_location_y: 0.8,
      opponent_location_x: 0.6,
      opponent_location_y: 0.2,
      landing_x: 0.3,
      landing_y: 0.1,
      backhand: false,
      aroundhead: true,
      temporalFeatures: { window_span_seconds: 1.2 },
    },
    { sampleId: "match-1-s2-r4-h3", fps: 30, split: "validation" },
  );

  assert.equal(result.schemaVersion, 1);
  assert.equal(result.sourceId, "shuttleset22");
  assert.equal(result.sampleId, "match-1-s2-r4-h3");
  assert.equal(result.strokeId, "smash");
  assert.equal(result.contactFrame, 42);
  assert.equal(result.contactFrameRelative, 0.5);
  assert.equal(result.windowStartFrame, 22);
  assert.equal(result.windowEndFrame, 62);
  assert.equal(result.features.playerPosition.x, 0.4);
  assert.equal(result.features.opponentPosition.y, 0.2);
  assert.equal(result.features.landing.x, 0.3);
  assert.equal(result.features.temporalFeatures.window_span_seconds, 1.2);
  assert.equal(result.provenance.publicEvidence, false);
});

test("normalizes BFMD dense annotations without loading media", () => {
  const result = normalizeTrainingRecord("bfmd", {
    matchId: "bfmd-1",
    rallyId: "rally-2",
    strokeId: "clear",
    hitFrame: 18,
    fps: 30,
    pose: { frames: [{ frameIndex: 18, keypoints: [] }] },
    court: { corners: [{ x: 0, y: 0 }] },
    shuttle: { points: [{ frameIndex: 18, x: 10, y: 20 }] },
  });

  assert.equal(result.sourceId, "bfmd");
  assert.equal(result.sampleId, "bfmd-1-rally-2");
  assert.equal(result.contactFrame, 18);
  assert.equal(result.pose.frames.length, 1);
  assert.equal(result.courtCorners.length, 1);
  assert.equal(result.shuttle.points[0].x, 10);
});

test("normalizes BST and RacketVision model inputs", () => {
  const bst = normalizeTrainingRecord("bst", {
    id: "bst-1",
    stroke_type: "drop",
    contact_frame: 11,
    joints: [{ frameIndex: 11, keypoints: [] }],
    shuttlecock: [{ frameIndex: 11, x: 2, y: 3 }],
    position: { x: 0.5, y: 0.5 },
  });
  const racketVision = normalizeTrainingRecord("racketvision", {
    match: "rv-1",
    rally: "r-1",
    frame: 7,
    ball: { x: 5, y: 6, visibility: 1 },
    racket: { keypoints: [[1, 2, 1]] },
  });

  assert.equal(bst.strokeId, "drop");
  assert.equal(bst.contactFrame, 11);
  assert.equal(bst.pose.frames[0].frameIndex, 11);
  assert.equal(racketVision.sampleId, "rv-1-r-1");
  assert.equal(racketVision.shuttle.points[0].x, 5);
  assert.equal(racketVision.racket.keypoints[0][0], 1);
});

test("rejects third-party held-out records and exposes checkpoint requirements", () => {
  assert.throws(
    () => normalizeTrainingRecord("bfmd", { id: "bad" }, { split: "held_out" }),
    /held-out split is reserved for own_capture/,
  );
  assert.deepEqual(TRAINING_CHECKPOINT_CONTRACT.requiredOutputs, [
    "strokeId",
    "contactFrame",
    "confidence",
    "provenance",
  ]);
});

test("accepts a third-party test split without treating it as held-out evidence", () => {
  const result = normalizeTrainingRecord(
    "shuttleset22",
    { id: "test-1", type: "smash", frame_num: 7 },
    { split: "test" },
  );

  assert.equal(result.split, "test");
  assert.equal(result.provenance.publicEvidence, false);
});

test("normalizes an own-capture held-out record without making training data public", () => {
  const result = normalizeTrainingRecord(
    "own_capture",
    { id: "own-1", strokeId: "smash", contactFrame: 12 },
    { split: "held_out" },
  );

  assert.equal(result.sourceId, "own_capture");
  assert.equal(result.split, "held_out");
  assert.equal(result.provenance.publicEvidence, false);
});
