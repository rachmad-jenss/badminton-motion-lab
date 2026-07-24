"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TECHNIQUE_STROKES, STROKE_LABELS } from "@bml/contracts";
import { agentBaseUrl, agentHealth, agentPost, agentPut, mediaUrlWithToken } from "@/lib/agent";

type AnalyzeResult = {
  analysisRunId: string;
  agentMediaUrl: string;
  summary: {
    metrics: Array<{
      metricId: string;
      value: number | null;
      unit: string;
      withheld: boolean;
      confidence: number;
      evidenceFrameIndex?: number;
    }>;
    findings: Array<{ id: string; title: string; observation: string; confidence: number }>;
    events: { mode: string; events: Array<{ type: string; frameIndex: number; confidence: number }> };
    court: { valid: boolean; method: string };
    quality: { passed: boolean };
    pose?: {
      adapter: string;
      detectedFrames?: number;
      totalFrames?: number;
    };
    racketCoverage?: number;
    shuttleCoverage?: number;
  };
};

export default function AnalyzePage() {
  const [path, setPath] = useState("");
  const [stroke, setStroke] = useState<(typeof TECHNIQUE_STROKES)[number]>("clear");
  const [includePureFootwork, setIncludePureFootwork] = useState(false);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [insight, setInsight] = useState<string | null>(null);
  const [byokKey, setByokKey] = useState("");
  const [byokProvider, setByokProvider] = useState("openai");

  useEffect(() => {
    void agentHealth().then((h) => setOnline(h.online));
  }, []);

  const modules = useMemo(() => {
    const list = [`technique:${stroke}`, `footwork:layer:${stroke}`];
    if (includePureFootwork) list.push("footwork:pure");
    return list;
  }, [stroke, includePureFootwork]);

  async function runAnalyze() {
    setBusy(true);
    setError(null);
    setInsight(null);
    try {
      const reg = await agentPost<{ captureId: string }>("/captures/register", { path });
      const out = await agentPost<AnalyzeResult>("/analyze", {
        capture_id: reg.captureId,
        modules,
        stroke_hint: stroke,
      });
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveByok() {
    await agentPut("/byok", {
      provider: byokProvider,
      api_key: byokKey,
      model: "gpt-4o-mini",
    });
    setByokKey("");
    alert("BYOK stored only on Local Agent (never cloud).");
  }

  async function loadInsight() {
    if (!result) return;
    const res = await agentPost<{ prose: string; byokUsed?: boolean }>("/insight", {
      analysis_run_id: result.analysisRunId,
      locale: "en",
    });
    setInsight(
      res.prose +
        (res.byokUsed
          ? "\n\n(BYOK LLM used)"
          : "\n\n(No API key — showing deterministic explanation of computed findings only)"),
    );
  }

  return (
    <main>
      <nav className="app-nav">
        <Link href="/">Labs</Link>
        <Link href="/analyze">Analyze</Link>
        <Link href="/compare">Compare</Link>
        <Link href="/agent">Local Agent</Link>
      </nav>

      <header className="hero">
        <h1 className="brand">Analyze</h1>
        <p className="tag">
          Register a local video path with the agent. Quality gate runs first. Review uses
          localhost media stream — originals are not uploaded.
        </p>
        <span className={`badge ${online ? "on" : "locked"}`}>
          Agent {online ? "online" : "offline"} · {agentBaseUrl()}
        </span>
      </header>

      {!online ? (
        <div className="notice">
          Start the Local Agent before analyzing. <Link href="/agent">Setup →</Link>
        </div>
      ) : null}

      <section className="panel">
        <h2>Job</h2>
        <label>
          Absolute local video path
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\\Videos\\clear-drill.mp4"
          />
        </label>
        <label>
          Stroke module
          <select
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
          <span>
            <input
              type="checkbox"
              checked={includePureFootwork}
              onChange={(e) => setIncludePureFootwork(e.target.checked)}
            />{" "}
            Also run Footwork Lab (pure)
          </span>
        </label>
        <div className="row">
          <button className="btn" disabled={!online || busy || !path} onClick={() => void runAnalyze()}>
            {busy ? "Running…" : "Run analysis"}
          </button>
        </div>
        {error ? <p className="muted" style={{ color: "var(--danger)" }}>{error}</p> : null}
      </section>

      {result ? (
        <>
          <section className="panel">
            <h2>Local review stream</h2>
            <p className="muted">Served by agent at {result.agentMediaUrl}</p>
            <video
              key={result.agentMediaUrl}
              controls
              src={mediaUrlWithToken(result.agentMediaUrl)}
              style={{ width: "100%", maxHeight: 420, background: "#000" }}
            />
          </section>

          <section className="panel">
            <h2>Perception</h2>
            <p className="muted">
              Pose: {result.summary.pose?.adapter} · detected{" "}
              {result.summary.pose?.detectedFrames}/{result.summary.pose?.totalFrames} · racket
              coverage {Number(result.summary.racketCoverage ?? 0).toFixed(2)} · shuttle coverage{" "}
              {Number(result.summary.shuttleCoverage ?? 0).toFixed(2)}
            </p>
            <p className="muted">
              Court:{" "}
              {result.summary.court.valid
                ? `valid (${result.summary.court.method})`
                : "invalid — footwork withheld"}{" "}
              · Events mode: {result.summary.events.mode}
            </p>
          </section>

          <section className="panel">
            <h2>Metrics</h2>
            <table>
              <thead>
                <tr>
                  <th>Metric</th>
                  <th>Value</th>
                  <th>Conf</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {result.summary.metrics.map((m) => (
                  <tr key={m.metricId}>
                    <td>{m.metricId}</td>
                    <td>{m.withheld ? "withheld" : `${m.value} ${m.unit}`}</td>
                    <td>{m.confidence.toFixed(2)}</td>
                    <td>f{m.evidenceFrameIndex ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section className="panel">
            <h2>AI insight (BYOK optional)</h2>
            <p className="muted">Explains computed findings only — never invents scores.</p>
            <label>
              Provider
              <select value={byokProvider} onChange={(e) => setByokProvider(e.target.value)}>
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            </label>
            <label>
              API key (stored on Local Agent only)
              <input
                type="password"
                value={byokKey}
                onChange={(e) => setByokKey(e.target.value)}
                placeholder="sk-…"
              />
            </label>
            <div className="row">
              <button className="btn secondary" onClick={() => void saveByok()} disabled={!byokKey}>
                Save key on agent
              </button>
              <button className="btn" onClick={() => void loadInsight()}>
                Generate insight
              </button>
            </div>
            {insight ? <pre style={{ whiteSpace: "pre-wrap" }}>{insight}</pre> : null}
          </section>
        </>
      ) : null}
    </main>
  );
}
