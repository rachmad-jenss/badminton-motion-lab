export const TRAINING_RECORD_SCHEMA_VERSION = 1;

const COMMON_MEDIA_POLICY = "no_redistribution";

export const SOURCE_ADAPTER_CONTRACTS = Object.freeze({
  bfmd: Object.freeze({
    adapter: "bfmd-v1",
    roles: Object.freeze(["pose", "court", "shuttle", "stroke", "hit_event"]),
    codeLicense: "not_declared",
    dataLicense: "non_commercial_academic_only",
    mediaPolicy: COMMON_MEDIA_POLICY,
    publicEvidence: false,
    heldOutPolicy: "own_capture_only",
  }),
  bst: Object.freeze({
    adapter: "bst-v1",
    roles: Object.freeze(["stroke_classifier", "pose_features", "shuttle_features", "court_position"]),
    codeLicense: "MIT",
    dataLicense: "upstream_dataset_specific",
    mediaPolicy: COMMON_MEDIA_POLICY,
    publicEvidence: false,
    heldOutPolicy: "own_capture_only",
  }),
  shuttleset: Object.freeze({
    adapter: "shuttleset-v1",
    roles: Object.freeze(["stroke", "contact_frame", "player_position", "court_homography", "rally_context"]),
    codeLicense: "MIT",
    dataLicense: "MIT_annotations_broadcast_media_restricted",
    mediaPolicy: COMMON_MEDIA_POLICY,
    publicEvidence: false,
    heldOutPolicy: "own_capture_only",
  }),
  shuttleset22: Object.freeze({
    adapter: "shuttleset22-v1",
    roles: Object.freeze(["stroke", "contact_frame", "player_position", "court_homography", "rally_context"]),
    codeLicense: "MIT",
    dataLicense: "MIT_annotations_broadcast_media_restricted",
    mediaPolicy: COMMON_MEDIA_POLICY,
    publicEvidence: false,
    heldOutPolicy: "own_capture_only",
  }),
  racketvision: Object.freeze({
    adapter: "racketvision-v1",
    roles: Object.freeze(["shuttle_tracking", "racket_pose", "ball_tracking", "trajectory"]),
    codeLicense: "MIT",
    dataLicense: "MIT_listing_provenance_review",
    mediaPolicy: "provenance_review_required",
    publicEvidence: false,
    heldOutPolicy: "own_capture_only",
  }),
});

export const OWN_CAPTURE_ADAPTER_CONTRACT = Object.freeze({
  adapter: "bml-own-capture-v1",
  roles: Object.freeze(["stroke", "contact_frame", "held_out_evaluation"]),
  codeLicense: "MIT",
  dataLicense: "bml_maintainer_owned",
  mediaPolicy: "own_capture_only",
  publicEvidence: false,
  heldOutPolicy: "own_capture_only",
});

export const TRAINING_CHECKPOINT_CONTRACT = Object.freeze({
  version: 1,
  modelId: "bml-technique-stroke-v1",
  inputSchemaVersion: TRAINING_RECORD_SCHEMA_VERSION,
  featureSchemaVersion: 1,
  requiredOutputs: Object.freeze(["strokeId", "contactFrame", "confidence", "provenance"]),
  heldOutSource: "own_capture",
});

function defined(...values) {
  return values.find((value) => value !== undefined && value !== null);
}

function numberOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function textOrNull(value) {
  if (value === undefined || value === null || value === "") return null;
  return String(value).trim().toLowerCase().replaceAll(" ", "_");
}

function seriesOrNull(value, key) {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return { [key]: value };
  if (typeof value === "object") return value;
  return null;
}

function sampleIdFor(sourceId, raw, requested) {
  if (requested) return String(requested);
  if (raw.id) return String(raw.id);
  if (sourceId === "bfmd") {
    return [raw.matchId ?? raw.match, raw.rallyId ?? raw.rally].filter(Boolean).join("-") || "bfmd-record";
  }
  if (sourceId === "racketvision") {
    return [raw.matchId ?? raw.match, raw.rallyId ?? raw.rally].filter(Boolean).join("-") || "racketvision-record";
  }
  if (sourceId === "shuttleset" || sourceId === "shuttleset22") {
    return [raw.match, raw.set, raw.rally, raw.ball_round].filter((value) => value !== undefined).join("-") || sourceId + "-record";
  }
  return sourceId + "-record";
}

function contractFor(sourceId) {
  if (sourceId === "own_capture") return OWN_CAPTURE_ADAPTER_CONTRACT;
  return SOURCE_ADAPTER_CONTRACTS[sourceId];
}

function position(x, y) {
  const px = numberOrNull(x);
  const py = numberOrNull(y);
  return px === null || py === null ? null : { x: px, y: py };
}

function normalizeSourceRecord(sourceId, raw, options, contract) {
  const split = String(defined(options.split, raw.split, "train"));
  if (!["train", "validation", "test", "held_out"].includes(split)) {
    throw new Error("unsupported training split: " + split);
  }
  if (split === "held_out" && sourceId !== "own_capture") {
    throw new Error("held-out split is reserved for own_capture");
  }
  if (sourceId === "own_capture" && split !== "held_out") {
    throw new Error("own_capture records must use held_out split");
  }

  let features = {};
  let strokeId = null;
  let contactFrame = null;
  let pose = null;
  let courtCorners = null;
  let shuttle = null;
  let racket = null;

  if (sourceId === "bfmd") {
    strokeId = textOrNull(defined(raw.strokeId, raw.stroke_id, raw.shotType, raw.shot_type));
    contactFrame = numberOrNull(defined(raw.contactFrame, raw.hitFrame, raw.hit_frame, raw.frameIndex, raw.frame_idx, raw.frame));
    pose = seriesOrNull(raw.pose, "frames");
    courtCorners = defined(raw.courtCorners, raw.court?.corners, raw.court) ?? null;
    shuttle = seriesOrNull(defined(raw.shuttle, raw.shuttleTrajectory), "points");
    racket = seriesOrNull(raw.racket, "points");
  } else if (sourceId === "bst") {
    strokeId = textOrNull(defined(raw.strokeId, raw.stroke_id, raw.strokeType, raw.stroke_type));
    contactFrame = numberOrNull(defined(raw.contactFrame, raw.contact_frame, raw.frameIndex, raw.frame));
    pose = seriesOrNull(defined(raw.pose, raw.joints), "frames");
    shuttle = seriesOrNull(defined(raw.shuttle, raw.shuttlecock), "points");
    features.playerPosition = raw.position ?? null;
  } else if (sourceId === "shuttleset" || sourceId === "shuttleset22") {
    strokeId = textOrNull(defined(raw.strokeId, raw.stroke_id, raw.type));
    contactFrame = numberOrNull(defined(raw.contactFrame, raw.frame_num, raw.frameIndex));
    features.playerPosition = position(raw.player_location_x, raw.player_location_y);
    features.opponentPosition = position(raw.opponent_location_x, raw.opponent_location_y);
    features.landing = position(raw.landing_x, raw.landing_y);
    features.backhand = typeof raw.backhand === "boolean" ? raw.backhand : null;
    features.aroundHead = typeof raw.aroundhead === "boolean" ? raw.aroundhead : null;
  } else if (sourceId === "racketvision") {
    strokeId = textOrNull(defined(raw.strokeId, raw.stroke_id, raw.shotType));
    contactFrame = numberOrNull(defined(raw.contactFrame, raw.frameIndex, raw.frame));
    pose = seriesOrNull(raw.pose, "frames");
    courtCorners = defined(raw.courtCorners, raw.court?.corners, raw.court) ?? null;
    const ball = defined(raw.shuttle, raw.ball);
    shuttle = ball ? { points: Array.isArray(ball) ? ball : [ball] } : null;
    racket = seriesOrNull(raw.racket, "points");
  } else if (sourceId === "own_capture") {
    strokeId = textOrNull(defined(raw.strokeId, raw.stroke_id, raw.strokeType, raw.stroke_type, raw.type));
    contactFrame = numberOrNull(defined(raw.contactFrame, raw.contact_frame, raw.frameIndex, raw.frame));
    pose = seriesOrNull(defined(raw.pose, raw.joints), "frames");
    shuttle = seriesOrNull(defined(raw.shuttle, raw.shuttlecock), "points");
    racket = seriesOrNull(raw.racket, "points");
    features = { ...(raw.features && typeof raw.features === "object" ? raw.features : {}) };
  }

  return {
    schemaVersion: TRAINING_RECORD_SCHEMA_VERSION,
    sampleId: sampleIdFor(sourceId, raw, options.sampleId),
    sourceId,
    split,
    strokeId,
    contactFrame,
    fps: numberOrNull(defined(options.fps, raw.fps)),
    pose,
    courtCorners,
    shuttle,
    racket,
    features,
    confidence: numberOrNull(defined(raw.confidence, options.confidence)),
    provenance: {
      sourceId,
      codeLicense: contract.codeLicense,
      dataLicense: contract.dataLicense,
      mediaPolicy: contract.mediaPolicy,
      publicEvidence: contract.publicEvidence,
    },
  };
}

export function validateNormalizedTrainingRecord(record) {
  const errors = [];
  if (record?.schemaVersion !== TRAINING_RECORD_SCHEMA_VERSION) errors.push("schemaVersion must be 1");
  if (!contractFor(record?.sourceId)) errors.push("unknown sourceId");
  if (!record?.sampleId) errors.push("sampleId is required");
  if (!["train", "validation", "test", "held_out"].includes(record?.split)) errors.push("unsupported split");
  if (record?.split === "held_out" && record?.sourceId !== "own_capture") {
    errors.push("held-out split is reserved for own_capture");
  }
  if (!record?.provenance || record.provenance.publicEvidence !== false) {
    errors.push("third-party training records cannot be public evidence");
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
  return record;
}

export function normalizeTrainingRecord(sourceId, rawRecord, options = {}) {
  const contract = contractFor(sourceId);
  if (!contract) throw new Error("unknown training source: " + sourceId);
  if (!rawRecord || typeof rawRecord !== "object" || Array.isArray(rawRecord)) {
    throw new Error("training record must be an object");
  }
  return validateNormalizedTrainingRecord(normalizeSourceRecord(sourceId, rawRecord, options, contract));
}
