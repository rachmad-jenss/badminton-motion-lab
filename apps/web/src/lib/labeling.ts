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

export type CourtCornerValidation =
  | { valid: true }
  | { valid: false; reason: string };

export function validateCourtCorners(
  corners: CourtCorner[],
  frame: { width: number; height: number },
): CourtCornerValidation {
  if (corners.length !== 4) {
    return { valid: false, reason: "Court calibration requires exactly four corners" };
  }
  for (let index = 0; index < corners.length; index += 1) {
    const corner = corners[index];
    if (!Number.isFinite(corner.x) || !Number.isFinite(corner.y)) {
      return { valid: false, reason: `Court corner ${index + 1} must contain numeric x and y` };
    }
    if (corner.x < 0 || corner.x > frame.width || corner.y < 0 || corner.y > frame.height) {
      return {
        valid: false,
        reason: `Court corner ${index + 1} is outside the ${frame.width}x${frame.height} frame`,
      };
    }
  }
  for (let a = 0; a < corners.length; a += 1) {
    for (let b = a + 1; b < corners.length; b += 1) {
      const dx = corners[a].x - corners[b].x;
      const dy = corners[a].y - corners[b].y;
      if (dx * dx + dy * dy <= 1e-6) {
        return { valid: false, reason: "Court corners must be unique" };
      }
    }
  }
  const area = Math.abs(
    corners.reduce(
      (sum, _, index) =>
        sum +
        corners[index].x * corners[(index + 1) % 4].y -
        corners[(index + 1) % 4].x * corners[index].y,
      0,
    ),
  ) / 2;
  if (area <= Math.max(1.0, frame.width * frame.height * 1e-6)) {
    return { valid: false, reason: "Court corners must form a non-degenerate quadrilateral" };
  }
  const turns = [0, 1, 2, 3].map((index) => {
    const a = corners[index];
    const b = corners[(index + 1) % 4];
    const c = corners[(index + 2) % 4];
    return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
  });
  if (!(turns.every((t) => t > 1e-6) || turns.every((t) => t < -1e-6))) {
    return { valid: false, reason: "Court corners must be ordered as a convex quadrilateral" };
  }
  return { valid: true };
}

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

