"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { METRIC_CATALOGUE, STROKE_LABELS, TECHNIQUE_STROKES } from "@bml/contracts";
import {
  agentBaseUrl,
  agentErrorMessage,
  agentHealth,
  agentPost,
  agentPut,
  agentReadiness,
  agentReadinessLabel,
  agentToken,
  mediaUrlWithToken,
  type AgentHealthResult,
} from "@/lib/agent";

type AnalyzeMetric = {
  metricId: string;
  value: number | null;
  unit: string;
  withheld: boolean;
  confidence: number;
  limitation?: string;
  evidenceFrameIndex?: number;
};

type AnalyzeFinding = {
  id: string;
  title: string;
  observation: string;
  confidence: number;
  limitation?: string;
  evidenceFrameIndices?: number[];
};

type AnalyzeResult = {
  analysisRunId: string;
  agentMediaUrl: string;
  summary: {
    metrics: AnalyzeMetric[];
    findings: AnalyzeFinding[];
    events: {
      mode: string;
      events: Array<{ type: string; frameIndex: number; confidence: number; source?: string }>;
    };
    court: { valid: boolean; method: string };
    quality: { passed: boolean };
    pose?: { adapter: string; detectedFrames?: number; totalFrames?: number };
    racketCoverage?: number;
    shuttleCoverage?: number;
  };
};

type AnalysisPhase = "idle" | "registering" | "analyzing" | "ready" | "failed";

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "High confidence";
  if (confidence >= 0.6) return "Medium confidence";
  return "Low confidence";
}

function metricLabel(metricId: string): string {
  return METRIC_CATALOGUE.find((metric) => metric.id === metricId)?.name ?? metricId;
}

export default function AnalyzePage() {
  const [path, setPath] = useState("");
  const [stroke, setStroke] = useState<(typeof TECHNIQUE_STROKES)[number]>("clear");
  const [dominantHand, setDominantHand] = useState<"left" | "right" | "unknown">("unknown");
  const [includePureFootwork, setIncludePureFootwork] = useState(false);
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [paired, setPaired] = useState(false);
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [selectedFrame, setSelectedFrame] = useState<number | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [insightStatus, setInsightStatus] = useState<string | null>(null);
  const [byokKey, setByokKey] = useState("");
  const [byokProvider, setByokProvider] = useState("openai");
  const [checking, setChecking] = useState(true);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    setPaired(Boolean(agentToken()));
    try {
      setHealth(await agentHealth());
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    void refreshHealth();
  }, [refreshHealth]);

  const modules = useMemo(() => {
    const list = [`technique:${stroke}`, `footwork:layer:${stroke}`];
    if (includePureFootwork) list.push("footwork:pure");
    return list;
  }, [stroke, includePureFootwork]);

  const readiness = agentReadiness(health);
  const busy = phase === "registering" || phase === "analyzing";
  const canAnalyze = readiness === "ready" && paired;
  const poseReady = health?.payload?.poseModelPresent !== false;
  const pairingChallengeReady = typeof health?.payload?.pairingCode === "string";

  async function runAnalyze() {
    const localPath = path.trim();
    if (!localPath) {
      setError("Enter the absolute path to a local video first.");
      return;
    }

    setPhase("registering");
    setError(null);
    setMediaError(null);
    setInsight(null);
    setInsightStatus(null);
    setResult(null);
    try {
      const reg = await agentPost<{ captureId: string }>("/captures/register", { path: localPath });
      setPhase("analyzing");
      const out = await agentPost<AnalyzeResult>("/analyze", {
        capture_id: reg.captureId,
        modules,
        stroke_hint: stroke,
        dominant_hand: dominantHand,
      });
      setResult(out);
      setPhase("ready");
    } catch (e) {
      setPhase("failed");
      setError(agentErrorMessage(e, "Analysis failed. Check the Local Agent and capture guide."));
    }
  }

  async function saveByok() {
    setInsightStatus(null);
    try {
      await agentPut("/byok", {
        provider: byokProvider,
        api_key: byokKey,
        model: "gpt-4o-mini",
      });
      setByokKey("");
      setInsightStatus("BYOK stored only on the Local Agent.");
    } catch (e) {
      setInsightStatus(agentErrorMessage(e, "Could not store the BYOK key on the Local Agent."));
    }
  }

  async function loadInsight() {
    if (!result) return;
    setInsightStatus(null);
    try {
      const res = await agentPost<{ prose: string; byokUsed?: boolean }>("/insight", {
        analysis_run_id: result.analysisRunId,
        locale: "en",
      });
      setInsight(
        res.prose +
          (res.byokUsed
            ? "\n\n(BYOK LLM used)"
            : "\n\n(No API key - showing deterministic explanation of computed findings only)"),
      );
    } catch (e) {
      setInsightStatus(agentErrorMessage(e, "Could not generate an insight from this analysis."));
    }
  }

  const phaseLabel = {
    idle: "Ready to analyze",
    registering: "Registering local capture...",
    analyzing: "Running quality gate and perception...",
    ready: "Analysis ready for review",
    failed: "Analysis needs attention",
  }[phase];

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Analyze</h1>
        <p className="tag">
          Register a local video path with the agent. Quality gate runs first. Review uses
          localhost media stream - originals are not uploaded.
        </p>
        <div className="row">
          <span className={`d-badge status-badge ${readiness === "ready" ? "on" : "locked"}`}>
            {agentReadinessLabel(readiness)} · {agentBaseUrl()}
          </span>
          <button className="d-btn d-btn-ghost" onClick={() => void refreshHealth()} disabled={checking}>
            {checking ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {readiness !== "ready" || !paired ? (
        <div className="notice" role={readiness === "checking" ? "status" : "alert"}>
          {readiness === "checking"
            ? "Checking the Local Agent before analysis..."
            : !poseReady
              ? "The Local Agent is missing its pose model."
              : !pairingChallengeReady
                ? "Refresh Local Agent health to obtain a live pairing code."
                : !paired
                  ? "Pair this browser with the Local Agent before analyzing."
                  : "Start and pair the Local Agent before analyzing."}{" "}
          <Link href="/agent">Open setup →</Link>
        </div>
      ) : null}

      <section className="panel">
        <h2>Job</h2>
        <label>
          Absolute local video path
          <input
            className="d-input"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\\Videos\\clear-drill.mp4"
            aria-describedby="path-help"
          />
          <span id="path-help" className="muted">
            The path is read by the Windows Local Agent on this machine; it is not uploaded to the
            cloud.
          </span>
        </label>
        <label>
          Stroke module
          <select
            className="d-select"
            value={stroke}
            onChange={(e) => setStroke(e.target.value as (typeof TECHNIQUE_STROKES)[number])}
          >
            {TECHNIQUE_STROKES.map((id) => (
              <option key={id} value={id}>
                {STROKE_LABELS[id]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dominant hand
          <select className="d-select" value={dominantHand} onChange={(e) => setDominantHand(e.target.value as typeof dominantHand)}>
            <option value="unknown">Unknown - let the agent infer per frame</option>
            <option value="right">Right-handed</option>
            <option value="left">Left-handed</option>
          </select>
          <span className="muted">Choose a hand when known so racket tracking stays consistent.</span>
        </label>
        <label>
          <span>
            <input
              className="d-checkbox"
              type="checkbox"
              checked={includePureFootwork}
              onChange={(e) => setIncludePureFootwork(e.target.checked)}
            />{" "}
            Also run Footwork Lab (pure)
          </span>
        </label>
        <div className="row">
          <button className="d-btn d-btn-primary" disabled={!canAnalyze || busy || !path.trim()} onClick={() => void runAnalyze()}>
            {busy ? "Running…" : "Run analysis"}
          </button>
          <Link className="d-btn d-btn-ghost" href="/capture-guide">Review capture requirements</Link>
        </div>
        <p className="status" role="status"><span className="phase">{phaseLabel}</span></p>
        {error ? <p className="status error" role="alert">{error}</p> : null}
      </section>

      {result ? (
        <>
          <section className="panel">
            <h2>Local review stream</h2>
            <p className="muted">Served by the Local Agent. Original video remains local.</p>
            <video
              key={result.agentMediaUrl}
              controls
              aria-label="Analyzed local video"
              src={mediaUrlWithToken(result.agentMediaUrl)}
              onError={() => setMediaError("The local media ticket expired or the file is unavailable. Run the analysis again.")}
              className="review-video"
            />
            {mediaError ? <p className="status error" role="alert">{mediaError}</p> : null}
            {selectedFrame != null ? (
              <p className="status" role="status">Selected evidence frame f{selectedFrame}. Use the video controls to locate it.</p>
            ) : null}
          </section>

          <section className="panel">
            <h2>Perception</h2>
            <p className="muted">
              Pose: {result.summary.pose?.adapter ?? "unknown"} · detected{" "}
              {result.summary.pose?.detectedFrames ?? "-"}/{result.summary.pose?.totalFrames ?? "-"} · racket
              coverage {Number(result.summary.racketCoverage ?? 0).toFixed(2)} · shuttle coverage{" "}
              {Number(result.summary.shuttleCoverage ?? 0).toFixed(2)}
            </p>
            <p className="muted">
              Court: {result.summary.court.valid ? `valid (${result.summary.court.method})` : "invalid - footwork withheld"} · Events mode: {result.summary.events.mode}
            </p>
          </section>

          <section className="panel">
            <h2>Findings and evidence</h2>
            {result.summary.findings.length === 0 ? (
              <p className="muted">No deterministic findings were produced for this run.</p>
            ) : (
              <ul className="evidence-list">
                {result.summary.findings.map((finding) => (
                  <li key={finding.id} className="evidence-item">
                    <strong>{finding.title}</strong>
                    <p>{finding.observation}</p>
                    <span className="muted">{confidenceLabel(finding.confidence)}</span>
                    {finding.limitation ? <p className="muted">Limitation: {finding.limitation}</p> : null}
                    {(finding.evidenceFrameIndices ?? []).map((frame) => (
                      <button key={frame} className="d-btn d-btn-ghost" type="button" onClick={() => setSelectedFrame(frame)}>
                        Review evidence frame f{frame}
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>Metrics</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Value</th>
                    <th>Confidence</th>
                    <th>Evidence</th>
                  </tr>
                </thead>
                <tbody>
                  {result.summary.metrics.map((metric) => (
                    <tr key={metric.metricId}>
                      <td className="metric-name">
                        <span>{metricLabel(metric.metricId)}</span>
                        <small>{metric.metricId}</small>
                      </td>
                      <td>
                        {metric.withheld
                          ? `Withheld${metric.limitation ? ` - ${metric.limitation}` : ""}`
                          : metric.value == null
                            ? "-"
                            : `${metric.value} ${metric.unit}`}
                      </td>
                      <td>{confidenceLabel(metric.confidence)}</td>
                      <td>
                        {metric.evidenceFrameIndex == null ? (
                          "-"
                        ) : (
                          <button className="d-btn d-btn-ghost" type="button" onClick={() => setSelectedFrame(metric.evidenceFrameIndex ?? null)}>
                            f{metric.evidenceFrameIndex}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel">
            <h2>Detected events</h2>
            <p className="muted">Mode: {result.summary.events.mode}. Event proposals are evidence, not certainty.</p>
            {result.summary.events.events.length === 0 ? (
              <p className="muted">No events were detected.</p>
            ) : (
              <ul className="evidence-list">
                {result.summary.events.events.map((event, index) => (
                  <li key={`${event.type}-${event.frameIndex}-${index}`} className="evidence-item">
                    <strong>{event.type.replaceAll("_", " ")}</strong>
                    <p className="muted">Frame f{event.frameIndex} · {confidenceLabel(event.confidence)}{event.source ? ` · ${event.source}` : ""}</p>
                    <button className="d-btn d-btn-ghost" type="button" onClick={() => setSelectedFrame(event.frameIndex)}>
                      Review event frame
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="panel">
            <h2>AI insight (BYOK optional)</h2>
            <p className="muted">Explains computed findings only - never invents scores.</p>
            <label>
              Provider
              <select className="d-select" value={byokProvider} onChange={(e) => setByokProvider(e.target.value)}>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label>
              API key (stored on Local Agent only)
              <input
                className="d-input"
                type="password"
                value={byokKey}
                onChange={(e) => setByokKey(e.target.value)}
                placeholder="sk-…"
              />
            </label>
            <div className="row">
              <button className="d-btn d-btn-ghost" onClick={() => void saveByok()} disabled={!byokKey}>
                Save key on agent
              </button>
              <button className="d-btn d-btn-primary" onClick={() => void loadInsight()}>
                Generate insight
              </button>
            </div>
            {insightStatus ? <p className="status" role="status">{insightStatus}</p> : null}
            {insight ? <pre className="insight-output">{insight}</pre> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
