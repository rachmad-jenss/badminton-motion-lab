import type { TechniqueStrokeId } from "../ontology/strokes.js";

export type MetricUnit =
  | "degrees"
  | "radians"
  | "px"
  | "meters"
  | "seconds"
  | "frames"
  | "ratio"
  | "count"
  | "score";

export type MetricFailSafe = "withhold" | "flag_low_confidence" | "use_corrected_only";

export interface MetricDefinition {
  id: string;
  name: string;
  description: string;
  unit: MetricUnit;
  inputs: string[];
  failSafe: MetricFailSafe;
  limitations: string[];
  version: string;
  strokeIds?: TechniqueStrokeId[];
  footworkPure?: boolean;
  footworkLayer?: boolean;
  requiresCourt?: boolean;
  requiresRacket?: boolean;
  requiresShuttle?: boolean;
}

const SHARED_JOINT: MetricDefinition[] = [
  {
    id: "elbow_angle_contact",
    name: "Elbow angle at contact",
    description: "Angle at racket-arm elbow nearest estimated contact frame.",
    unit: "degrees",
    inputs: ["pose.landmarks", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Single-camera depth ambiguity", "Occlusion near body"],
    version: "1.0.0",
    requiresRacket: true,
  },
  {
    id: "shoulder_abduction_contact",
    name: "Shoulder abduction at contact",
    description: "2D projected angle between the racket-side upper arm and trunk at contact.",
    unit: "degrees",
    inputs: ["pose.landmarks", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Camera angle and depth sensitive", "Not a 3D anatomical measurement"],
    version: "1.1.0",
  },
  {
    id: "trunk_lean_contact",
    name: "Trunk lean at contact",
    description: "Lateral trunk lean relative to vertical at contact.",
    unit: "degrees",
    inputs: ["pose.landmarks", "events.contact_frame"],
    failSafe: "flag_low_confidence",
    limitations: ["Assumes upright camera roll"],
    version: "1.0.0",
  },
  {
    id: "wrist_height_ratio_contact",
    name: "Wrist height ratio at contact",
    description: "Racket wrist height relative to body height at contact.",
    unit: "ratio",
    inputs: ["pose.landmarks", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Not absolute meters without calibration"],
    version: "1.0.0",
    requiresRacket: true,
  },
  {
    id: "racket_speed_proxy_contact",
    name: "Racket speed proxy near contact",
    description: "Pixel/frame speed of racket tip in a window around contact.",
    unit: "px",
    inputs: ["racket.trajectory", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Not true m/s without metric calibration"],
    version: "1.0.0",
    requiresRacket: true,
  },
  {
    id: "shuttle_approach_angle",
    name: "Shuttle approach angle",
    description: "Estimated approach direction of shuttle toward contact.",
    unit: "degrees",
    inputs: ["shuttle.trajectory", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Blur and occlusion common"],
    version: "1.0.0",
    requiresShuttle: true,
  },
];

const FOOTWORK_LAYER: MetricDefinition[] = [
  {
    id: "split_step_timing_to_contact",
    name: "Split-step timing to contact",
    description: "Frames from split-step landing to contact.",
    unit: "frames",
    inputs: ["events.split_step", "events.contact_frame"],
    failSafe: "withhold",
    limitations: ["Requires reliable foot event detection"],
    version: "1.0.0",
    footworkLayer: true,
  },
  {
    id: "recovery_path_length_court",
    name: "Recovery path length (court)",
    description: "Path length on court plane from contact to base return.",
    unit: "meters",
    inputs: ["pose.trajectory", "court.homography", "events.contact_frame", "events.base_return"],
    failSafe: "withhold",
    limitations: ["Requires valid court calibration"],
    version: "1.0.0",
    footworkLayer: true,
    requiresCourt: true,
  },
  {
    id: "stance_width_contact",
    name: "Stance width at contact",
    description: "Distance between ankles at contact in court meters when available.",
    unit: "meters",
    inputs: ["pose.landmarks", "court.homography", "events.contact_frame"],
    failSafe: "flag_low_confidence",
    limitations: ["Falls back to pixels if court invalid"],
    version: "1.0.0",
    footworkLayer: true,
    requiresCourt: true,
  },
];

const FOOTWORK_PURE: MetricDefinition[] = [
  {
    id: "split_step_count",
    name: "Split-step count",
    description: "Number of detected split-steps in the drill window.",
    unit: "count",
    inputs: ["events.split_step"],
    failSafe: "flag_low_confidence",
    limitations: ["False positives on shallow bounces"],
    version: "1.0.0",
    footworkPure: true,
  },
  {
    id: "first_step_latency",
    name: "First-step latency",
    description: "Time from cue/split to first directional step.",
    unit: "seconds",
    inputs: ["events.split_step", "events.first_step"],
    failSafe: "withhold",
    limitations: ["Cue must be annotated or auto-detected"],
    version: "1.0.0",
    footworkPure: true,
  },
  {
    id: "court_coverage_area",
    name: "Court coverage area",
    description: "Convex hull area of footpath on court plane.",
    unit: "meters",
    inputs: ["pose.trajectory", "court.homography"],
    failSafe: "withhold",
    limitations: ["Requires valid court calibration"],
    version: "1.0.0",
    footworkPure: true,
    requiresCourt: true,
  },
  {
    id: "path_efficiency",
    name: "Path efficiency",
    description: "Straight-line distance / actual path length toward targets.",
    unit: "ratio",
    inputs: ["pose.trajectory", "court.homography"],
    failSafe: "withhold",
    limitations: ["Target positions must be known or annotated"],
    version: "1.0.0",
    footworkPure: true,
    requiresCourt: true,
  },
  {
    id: "landing_symmetry",
    name: "Landing symmetry",
    description: "Left/right load proxy from ankle vertical motion symmetry.",
    unit: "ratio",
    inputs: ["pose.landmarks"],
    failSafe: "flag_low_confidence",
    limitations: ["Not a force measurement"],
    version: "1.0.0",
    footworkPure: true,
  },
];

function forAllStrokes(defs: MetricDefinition[]): MetricDefinition[] {
  return defs.map((d) => ({
    ...d,
    strokeIds: d.strokeIds ?? [
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
    ],
  }));
}

export const METRIC_CATALOGUE: MetricDefinition[] = [
  ...forAllStrokes(SHARED_JOINT),
  ...forAllStrokes(FOOTWORK_LAYER),
  ...FOOTWORK_PURE,
];

export function metricsForStroke(stroke: TechniqueStrokeId): MetricDefinition[] {
  return METRIC_CATALOGUE.filter(
    (m) => m.strokeIds?.includes(stroke) && !m.footworkPure,
  );
}

export function metricsForFootworkPure(): MetricDefinition[] {
  return METRIC_CATALOGUE.filter((m) => m.footworkPure);
}

export function metricsForFootworkLayer(stroke: TechniqueStrokeId): MetricDefinition[] {
  return METRIC_CATALOGUE.filter(
    (m) => m.footworkLayer && m.strokeIds?.includes(stroke),
  );
}
