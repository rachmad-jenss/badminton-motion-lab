export type ModuleStatus = "locked" | "on";

export interface BenchmarkGate {
  /** Contact frame error threshold in frames at reference 30fps. */
  contactFrameTolerance: number;
  minProposalConfidence: number;
  requiresCourtForFootwork: boolean;
  requiresRacket: boolean;
  requiresShuttle: boolean;
  fixturePassRate: number;
}

export const DEFAULT_BENCHMARK_GATE: BenchmarkGate = {
  contactFrameTolerance: 3,
  minProposalConfidence: 0.55,
  requiresCourtForFootwork: true,
  requiresRacket: true,
  requiresShuttle: true,
  fixturePassRate: 1.0,
};

export interface ModuleBenchmarkReport {
  moduleId: string;
  generatedAt: string;
  pipelineVersion: string;
  gate: BenchmarkGate;
  contactMaeFrames: number | null;
  proposalConfidenceMean: number | null;
  fixturePassRate: number;
  racketTrackCoverage: number | null;
  shuttleTrackCoverage: number | null;
  courtValidRate: number | null;
  passed: boolean;
  notes: string[];
}

export interface ModuleReadinessRecord {
  moduleId: string;
  status: ModuleStatus;
  benchmarkReportPath: string | null;
  unlockedAt: string | null;
  label: string;
  kind: string;
}

export function evaluateBenchmark(
  report: Omit<ModuleBenchmarkReport, "passed" | "gate"> & {
    gate?: BenchmarkGate;
  },
  kind: "technique_stroke" | "footwork_pure" | "footwork_layer",
): ModuleBenchmarkReport {
  const gate = report.gate ?? DEFAULT_BENCHMARK_GATE;
  const notes: string[] = [...(report.notes ?? [])];
  let passed = report.fixturePassRate >= gate.fixturePassRate;

  if (kind === "technique_stroke" || kind === "footwork_layer") {
    if (report.contactMaeFrames == null || report.contactMaeFrames > gate.contactFrameTolerance) {
      passed = false;
      notes.push("Contact MAE exceeds tolerance or missing");
    }
    if (
      report.proposalConfidenceMean == null ||
      report.proposalConfidenceMean < gate.minProposalConfidence
    ) {
      passed = false;
      notes.push("Proposal confidence below gate");
    }
  }

  if (kind === "technique_stroke") {
    if (gate.requiresRacket && (report.racketTrackCoverage ?? 0) < 0.8) {
      passed = false;
      notes.push("Racket track coverage below 0.8");
    }
    if (gate.requiresShuttle && (report.shuttleTrackCoverage ?? 0) < 0.7) {
      passed = false;
      notes.push("Shuttle track coverage below 0.7");
    }
  }

  if (kind === "footwork_pure" || kind === "footwork_layer") {
    if (gate.requiresCourtForFootwork && (report.courtValidRate ?? 0) < 1) {
      passed = false;
      notes.push("Court calibration not valid on all fixtures");
    }
  }

  return {
    ...report,
    gate,
    notes,
    passed,
  };
}

export function publicCompleteness(records: ModuleReadinessRecord[]): {
  complete: boolean;
  locked: string[];
  on: string[];
} {
  const locked = records.filter((r) => r.status === "locked").map((r) => r.moduleId);
  const on = records.filter((r) => r.status === "on").map((r) => r.moduleId);
  return { complete: locked.length === 0 && on.length === records.length, locked, on };
}
