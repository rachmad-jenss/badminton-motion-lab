export type CourtCorner = { x: number; y: number };

export type LabelingHand = "forehand" | "backhand" | "around_head" | "unknown";

export type LabelingTruth = {
  id: string;
  fixtureKind: "badminton_stroke";
  sha256: string;
  fps: number;
  contactFrameTruth: number | null;
  courtCorners: CourtCorner[];
  strokeId: string;
  hand: LabelingHand;
  notes?: string;
};

export function frameFromTime(seconds: number, fps: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) return 0;
  return Math.round(seconds * fps);
}

export function timeFromFrame(frame: number, fps: number): number {
  return fps > 0 ? frame / fps : 0;
}

export function safeTruthFilename(id: string): string {
  const cleaned = id.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "");
  return (cleaned || "capture") + ".truth.json";
}

export function buildLabelingTruth(input: {
  id: string;
  fps: number;
  contactFrameTruth: number | null;
  courtCorners: CourtCorner[];
  strokeId: string;
  hand: LabelingHand;
  notes?: string;
}): LabelingTruth {
  return {
    id: input.id,
    fixtureKind: "badminton_stroke",
    sha256: "",
    fps: input.fps,
    contactFrameTruth: input.contactFrameTruth,
    courtCorners: input.courtCorners,
    strokeId: input.strokeId,
    hand: input.hand,
    notes: input.notes,
  };
}

export function labelingTruthJson(truth: LabelingTruth): string {
  return JSON.stringify(truth, null, 2);
}

