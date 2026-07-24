export const ANALYSIS_PACKAGE_VERSION = "1.0.0";
export const PIPELINE_VERSION = "0.1.0";

export interface ArtifactRef {
  path: string;
  sha256: string;
  mediaType: string;
  bytes: number;
}

export interface AnalysisManifest {
  packageVersion: string;
  pipelineVersion: string;
  analysisRunId: string;
  captureId: string;
  createdAt: string;
  sourceMedia: {
    fingerprint: string;
    originalPath?: string;
    durationMs: number;
    fps: number;
    width: number;
    height: number;
  };
  modulesRequested: string[];
  steps: PipelineStepRecord[];
  artifacts: Record<string, ArtifactRef>;
  qualityGate: QualityGateResult;
  court: CourtCalibrationResult | null;
}

export interface PipelineStepRecord {
  stepId: string;
  version: string;
  status: "ok" | "skipped" | "failed";
  startedAt: string;
  finishedAt: string;
  inputHashes: string[];
  outputHashes: string[];
  error?: string;
}

export interface QualityGateResult {
  passed: boolean;
  checks: QualityCheck[];
  captureProfile: string;
}

export interface QualityCheck {
  id: string;
  passed: boolean;
  measured: number | string | boolean | null;
  threshold: number | string | boolean | null;
  message: string;
}

export interface CourtCalibrationResult {
  method: "auto_lines" | "manual_four_corners";
  valid: boolean;
  cornersImage: Array<{ x: number; y: number }>;
  homography: number[][] | null;
  confidence: number;
  message: string;
}

export interface PoseLandmark {
  name: string;
  x: number;
  y: number;
  z?: number;
  confidence: number;
}

export interface PoseFrame {
  frameIndex: number;
  timeMs: number;
  landmarks: PoseLandmark[];
}

export interface TrackPoint {
  frameIndex: number;
  timeMs: number;
  x: number;
  y: number;
  confidence: number;
  interpolated: boolean;
}

export interface ProposedEvent {
  type: string;
  frameIndex: number;
  timeMs: number;
  confidence: number;
  source: "model" | "manual" | "corrected";
  repIndex?: number;
}

export interface MetricObservation {
  metricId: string;
  value: number | null;
  unit: string;
  confidence: number;
  withheld: boolean;
  limitation?: string;
  evidenceFrameIndex?: number;
  repIndex?: number;
  version: string;
}

export interface StructuredFinding {
  id: string;
  moduleId: string;
  title: string;
  observation: string;
  metricIds: string[];
  evidenceFrameIndices: number[];
  confidence: number;
  limitation?: string;
}

export interface InsightRequest {
  findings: StructuredFinding[];
  metrics: MetricObservation[];
  locale: string;
}

export interface InsightResponse {
  prose: string;
  citedFindingIds: string[];
  provider: string;
  model: string;
  fabricatedMetricsAttempted: false;
}
