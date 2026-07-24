export * from "./ontology/strokes.js";
export * from "./metrics/catalogue.js";
export * from "./readiness/registry.js";
export * from "./schemas/analysis.js";
export * from "./insight/contract.js";

export const CAPTURE_QUALITY_THRESHOLDS = {
  minWidth: 1280,
  minHeight: 720,
  minFps: 30,
  minBrightness: 40,
  maxBrightness: 220,
  minBodyVisibilityRatio: 0.85,
  allowedYawDeg: 35,
  profileId: "side_ish_full_body_v1",
} as const;
