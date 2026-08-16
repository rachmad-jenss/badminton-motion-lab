"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { METRIC_CATALOGUE, STROKE_LABELS, TECHNIQUE_STROKES } from "@bml/contracts";
import { OnboardingSteps } from "@/components/OnboardingSteps";
import {
  agentBaseUrl,
  agentErrorInfo,
  agentErrorMessage,
  agentHealth,
  agentImport,
  agentPost,
  agentPut,
  agentReadiness,
  agentReadinessLabel,
  agentToken,
  mediaUrlWithToken,
  type AgentErrorInfo,
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [stroke, setStroke] = useState<(typeof TECHNIQUE_STROKES)[number]>("clear");
  const [dominantHand, setDominantHand] = useState<"left" | "right" | "unknown">("unknown");
  const [includePureFootwork, setIncludePureFootwork] = useState(false);
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [paired, setPaired] = useState(false);
  const [phase, setPhase] = useState<AnalysisPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorInfo, setErrorInfo] = useState<AgentErrorInfo | null>(null);
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
    if (!selectedFile && !localPath) {
      setError("Choose a video from this PC before starting the analysis.");
      setErrorInfo(null);
      return;
    }

    setPhase("registering");
    setError(null);
    setErrorInfo(null);
    setMediaError(null);
    setInsight(null);
    setInsightStatus(null);
    setResult(null);
    try {
      const reg = selectedFile
        ? await agentImport<{ captureId: string }>(selectedFile)
        : await agentPost<{ captureId: string }>("/captures/register", { path: localPath });
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
      const info = agentErrorInfo(e, "Analysis failed. Check the Local Agent and capture guide.");
      setErrorInfo(info);
      setError(info.message);
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
      setInsightStatus("Provider key stored only on this PC.");
    } catch (e) {
      setInsightStatus(agentErrorMessage(e, "Could not store the provider key on this PC."));
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
            ? "\n\n(Your provider key was used)"
            : "\n\n(No API key - showing deterministic explanation of computed findings only)"),
      );
    } catch (e) {
      setInsightStatus(agentErrorMessage(e, "Could not generate an insight from this analysis."));
    }
  }

  function downloadReport() {
    if (!result) return;
    const payload = {
      analysisRunId: result.analysisRunId,
      exportedAt: new Date().toISOString(),
      summary: result.summary,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bml-report-" + result.analysisRunId + ".json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
  const phaseLabel = {
    idle: "Ready to analyze",
    registering: selectedFile ? "Preparing your local video..." : "Registering local capture...",
    analyzing: "Running quality gate and perception...",
    ready: "Analysis ready for review",
    failed: "Analysis needs attention",
  }[phase];

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Analyze video</h1>
        <p className="tag">
          Choose a video from this PC. We check whether it is clear enough before measuring your
          movement; the original stays on this PC.
        </p>
        <div className="row hero-actions">
          <span className={`d-badge status-badge ${canAnalyze ? "on" : "locked"}`}>
            {canAnalyze
              ? "Ready to analyze"
              : readiness === "ready"
                ? "Pair this browser first"
                : agentReadinessLabel(readiness)} · {agentBaseUrl()}
          </span>
          <button className="d-btn d-btn-ghost" onClick={() => void refreshHealth()} disabled={checking}>
            {checking ? "Refreshing…" : "Refresh"}
          </button>
          {readiness !== "ready" || !paired ? (
            <Link className="d-btn d-btn-ghost" href="/agent">
              Open setup
            </Link>
          ) : null}
        </div>
      </header>

      {readiness !== "ready" || !paired ? (
        <div className="notice" role={readiness === "checking" ? "status" : "alert"}>
          {readiness === "checking"
            ? "Checking setup before analysis..."
            : !poseReady
              ? "The helper app is missing its video model."
              : !pairingChallengeReady
                ? "Refresh setup to get a live pairing code."
                : !paired
                  ? "Pair this browser before analyzing."
                  : "Start and pair the helper app before analyzing."}{" "}
          <Link href="/agent">Open setup →</Link>
        </div>
      ) : null}

      <section className="panel">
        <h2>Choose your video</h2>
        <label>
          Choose a video from this PC
          <input
            key={fileInputKey}
            className="d-input"
            type="file"
            accept="video/*"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null;
              setSelectedFile(file);
              if (file) setPath("");
            }}
            aria-describedby="file-help"
          />
          <span id="file-help" className="muted">
            The video is sent only to the helper app on this PC. It is not uploaded to the cloud.
          </span>
        </label>
        {selectedFile ? <p className="status" role="status">Selected: {selectedFile.name}</p> : null}
        <details className="advanced-details">
          <summary>Advanced: use a video path</summary>
          <label>
            Local video path
          <input
            className="d-input"
            value={path}
            onChange={(e) => {
              const nextPath = e.target.value;
              setPath(nextPath);
              if (nextPath.trim()) {
                setSelectedFile(null);
                setFileInputKey((current) => current + 1);
              }
            }}
            placeholder="C:\\Videos\\clear-drill.mp4"
            aria-describedby="path-help"
          />
          <span id="path-help" className="muted">
            The path is read by the helper app on this machine; it is not uploaded to the
            cloud.
          </span>
          </label>
        </details>
        <label>
          What are you practicing?
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
            Also include a footwork-only check
          </span>
        </label>
        <div className="row">
          <button className="d-btn d-btn-primary" disabled={!canAnalyze || busy || (!selectedFile && !path.trim())} onClick={() => void runAnalyze()}>
            {busy ? "Checking video…" : "Analyze this video"}
          </button>
          <Link className="d-btn d-btn-ghost" href="/capture-guide">How to record a good video</Link>
        </div>
        <p className="status" role="status"><span className="phase">{phaseLabel}</span></p>
        {error ? (
          <div className="status error" role="alert">
            <p>{error}</p>
            {errorInfo?.action ? <p>Next step: {errorInfo.action}</p> : null}
            {errorInfo?.failedQualityChecks?.length ? (
              <ul>
                {errorInfo.failedQualityChecks.map((check) => (
                  <li key={check.id}>
                    {check.message ?? check.id}
                    {check.measured != null && check.threshold != null
                      ? ` (measured ${check.measured}, needs ${check.threshold})`
                      : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </section>

      {result ? (
        <>
          <OnboardingSteps readiness={readiness} paired={paired} completed={phase === "ready"} />
          <section className="panel">
            <h2>Your video review</h2>
            <p className="muted">The helper app serves this video locally. The original remains on this PC.</p>
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
            <h2>Video check</h2>
            <p className="muted">
              {result.summary.quality.passed
                ? "The video passed the automatic check, so the measurements below can be reviewed."
                : "Some measurements were withheld because the video did not pass the automatic check."}
            </p>
            <details className="install-details">
              <summary>Technical details</summary>
              <p className="muted">
                Video model: {result.summary.pose?.adapter ?? "unknown"} · visible frames{" "}
                {result.summary.pose?.detectedFrames ?? "-"}/{result.summary.pose?.totalFrames ?? "-"} · racket
                coverage {Number(result.summary.racketCoverage ?? 0).toFixed(2)} · shuttle coverage{" "}
                {Number(result.summary.shuttleCoverage ?? 0).toFixed(2)}
              </p>
              <p className="muted">
                Court: {result.summary.court.valid ? `valid (${result.summary.court.method})` : "invalid - footwork withheld"} · event mode: {result.summary.events.mode}
              </p>
            </details>
          </section>

          <section className="panel">
            <h2>What we found</h2>
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
            <div className="row">
              <h2>Measurements</h2>
              <button
                className="d-btn d-btn-ghost"
                type="button"
                onClick={() => void downloadReport()}
              >
                Download report (JSON)
              </button>
            </div>
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
                        <details>
                          <summary>Technical name</summary>
                          <small>{metric.metricId}</small>
                        </details>
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
            <h2>Important moments</h2>
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
            <h2>
              Optional written explanation <span className="status-badge">Experimental</span>
            </h2>
            <p className="muted">Get a plain-language explanation of the measured findings. It never invents scores.</p>
            <button className="d-btn d-btn-primary" onClick={() => void loadInsight()}>
              Explain these results
            </button>
            <details className="install-details">
              <summary>Advanced: use your own AI provider key</summary>
              <label>
                Provider
                <select className="d-select" value={byokProvider} onChange={(e) => setByokProvider(e.target.value)}>
                  <option value="openai">OpenAI</option>
                  <option value="openrouter">OpenRouter</option>
                </select>
              </label>
              <label>
                Provider key (stored on this PC only)
                <input
                  className="d-input"
                  type="password"
                  value={byokKey}
                  onChange={(e) => setByokKey(e.target.value)}
                  placeholder="Paste key"
                />
              </label>
              <button className="d-btn d-btn-ghost" onClick={() => void saveByok()} disabled={!byokKey}>
                Save key on helper app
              </button>
            </details>
            {insightStatus ? <p className="status" role="status">{insightStatus}</p> : null}
            {insight ? <pre className="insight-output">{insight}</pre> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
