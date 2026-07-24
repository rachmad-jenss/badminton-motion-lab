/** Technique Lab stroke IDs from Master Plan — each unlocks independently. */
export const TECHNIQUE_STROKES = [
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
] as const;

export type TechniqueStrokeId = (typeof TECHNIQUE_STROKES)[number];

export const STROKE_LABELS: Record<TechniqueStrokeId, string> = {
  serve: "Serve",
  forehand: "Forehand",
  backhand: "Backhand",
  smash: "Smash",
  clear: "Clear",
  drop: "Drop shot",
  drive: "Drive",
  net_shot: "Net shot",
  lift: "Lift",
  block: "Block",
  defensive_return: "Defensive return",
  jump_smash: "Jump smash",
};

/** Movement phases shared across overhead / stroke analysis. */
export const MOVEMENT_PHASES = [
  "ready",
  "loading",
  "backswing",
  "acceleration",
  "contact",
  "follow_through",
  "landing",
  "recovery",
] as const;

export type MovementPhaseId = (typeof MOVEMENT_PHASES)[number];

export const FOOTWORK_EVENTS = [
  "split_step",
  "first_step",
  "chasse",
  "crossover",
  "lunge",
  "hop",
  "recovery_step",
  "base_return",
] as const;

export type FootworkEventId = (typeof FOOTWORK_EVENTS)[number];

export const FOOTWORK_EVENT_LABELS: Record<FootworkEventId, string> = {
  split_step: "Split-step",
  first_step: "First-step",
  chasse: "Chassé",
  crossover: "Crossover",
  lunge: "Lunge",
  hop: "Hop",
  recovery_step: "Recovery step",
  base_return: "Return to base",
};

export type ModuleKind = "technique_stroke" | "footwork_pure" | "footwork_layer";

export type ModuleId =
  | `technique:${TechniqueStrokeId}`
  | "footwork:pure"
  | `footwork:layer:${TechniqueStrokeId}`;

export function techniqueModuleId(stroke: TechniqueStrokeId): ModuleId {
  return `technique:${stroke}`;
}

export function footworkLayerModuleId(stroke: TechniqueStrokeId): ModuleId {
  return `footwork:layer:${stroke}`;
}

export const FOOTWORK_PURE_MODULE_ID: ModuleId = "footwork:pure";

export function allModuleIds(): ModuleId[] {
  const technique = TECHNIQUE_STROKES.map(techniqueModuleId);
  const layers = TECHNIQUE_STROKES.map(footworkLayerModuleId);
  return [...technique, FOOTWORK_PURE_MODULE_ID, ...layers];
}

export function moduleKind(id: ModuleId): ModuleKind {
  if (id === "footwork:pure") return "footwork_pure";
  if (id.startsWith("footwork:layer:")) return "footwork_layer";
  return "technique_stroke";
}

export function moduleLabel(id: ModuleId): string {
  if (id === "footwork:pure") return "Footwork Lab (pure)";
  if (id.startsWith("footwork:layer:")) {
    const stroke = id.replace("footwork:layer:", "") as TechniqueStrokeId;
    return `Footwork layer — ${STROKE_LABELS[stroke]}`;
  }
  const stroke = id.replace("technique:", "") as TechniqueStrokeId;
  return `Technique — ${STROKE_LABELS[stroke]}`;
}
