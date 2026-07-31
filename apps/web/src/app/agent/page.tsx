"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentBaseUrl,
  agentErrorMessage,
  agentHealth,
  agentPost,
  agentReadiness,
  setAgentToken,
  AgentRequestError,
  type AgentHealthResult,
} from "@/lib/agent";

export default function AgentPage() {
  const [url, setUrl] = useState("http://127.0.0.1:8787");
  const [code, setCode] = useState("");
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [urlReady, setUrlReady] = useState(false);
  const urlRef = useRef(url);
  const healthRequestRef = useRef(0);

  function applyHealth(h: AgentHealthResult) {
    setHealth(h);
    const pairingCode = h.payload?.pairingCode;
    setCode(typeof pairingCode === "string" ? pairingCode : "");
    if (!h.online) setError(h.error || "Local Agent is offline.");
  }

  useEffect(() => {
    const saved = localStorage.getItem("bml.agentUrl");
    if (saved) {
      urlRef.current = saved;
      setUrl(saved);
    }
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (urlReady) localStorage.setItem("bml.agentUrl", url);
  }, [url, urlReady]);

  const refreshHealth = useCallback(async () => {
    const requestId = ++healthRequestRef.current;
    const requestedUrl = urlRef.current.trim();
    setChecking(true);
    setError(null);
    setStatus("");
    if (!requestedUrl) {
      setHealth(null);
      setCode("");
      setError("Enter the Local Agent URL before refreshing health.");
      setChecking(false);
      return;
    }
    try {
      const nextHealth = await agentHealth(requestedUrl);
      if (requestId !== healthRequestRef.current || urlRef.current.trim() !== requestedUrl) return;
      applyHealth(nextHealth);
    } finally {
      if (requestId === healthRequestRef.current) setChecking(false);
    }
  }, []);

  useEffect(() => {
    if (urlReady) void refreshHealth();
  }, [refreshHealth, urlReady]);

  async function pair() {
    if (!code) {
      setError("Refresh health to obtain a live, one-time pairing code.");
      return;
    }
    setPairing(true);
    setError(null);
    setStatus("");
    try {
      const res = await agentPost<{ token: string }>("/pair", {
        pairing_code: code,
        device_name: "Windows Local Agent",
      });
      setAgentToken(res.token);
      await refreshHealth();
      setStatus("Paired locally. Keep the agent running while reviewing video.");
    } catch (e) {
      setError(
        e instanceof AgentRequestError && e.status === 401
          ? "Invalid pairing code. Refresh the code and try again."
          : agentErrorMessage(e, "Pairing failed. Refresh the code and try again."),
      );
    } finally {
      setPairing(false);
    }
  }

  const readiness = agentReadiness(health);
  const poseReady = health?.payload?.poseModelPresent !== false;
  const pairingReady = typeof health?.payload?.pairingCode === "string";
  const checks = [
    { label: "Helper app", ok: health?.online === true },
    { label: "Video model", ok: health?.payload?.poseModelPresent !== false && health?.online === true },
    { label: "Browser pairing", ok: typeof health?.payload?.pairingCode === "string" },
  ];

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Setup on this PC</h1>
        <p className="tag">
          Start the small helper app on this PC, pair this browser, then choose a video. Your
          original video stays on this PC.
        </p>
        <div className="row hero-actions">
          <span className={`d-badge status-badge ${readiness === "ready" ? "on" : "locked"}`}>
            {checking ? "Checking setup…" : readiness === "ready" ? "Ready to analyze" : "Setup needs attention"}
          </span>
          <a className="d-btn d-btn-primary" href="#pair">
            Go to pairing
          </a>
          <button className="d-btn d-btn-ghost" onClick={() => void refreshHealth()} disabled={checking}>
            Refresh health
          </button>
        </div>
      </header>

      <section className="panel">
        <h2>Setup check</h2>
        <ul className="check-list">
          {checks.map((check) => (
            <li key={check.label}>
              <span>{check.label}</span>
              <strong className={check.ok ? "check-ok" : "check-fail"}>
                {check.ok ? "Ready" : "Needs attention"}
              </strong>
            </li>
          ))}
        </ul>
        <p className="muted">
          {readiness === "offline"
            ? "Start the helper app, then refresh this setup check."
            : !poseReady
              ? "Install the missing video model before analyzing."
              : !pairingReady
                ? "Refresh this setup check to get a one-time pairing code."
                : "Pair this browser below, then open Analyze video and choose a video."}
        </p>
      </section>

      <section className="panel">
        <h2>Start on Windows</h2>
        <p>
          If you are new to this app, open the project folder in Windows Explorer and double-click
          <code>infra/windows/install-agent.cmd</code>. It installs the helper app, checks its
          video tools, and opens this setup page when the agent is healthy.
        </p>
        <ol className="muted">
          <li>
            Keep the helper-app console open while you analyze a video.
          </li>
          <li>
            Click <strong>Pair browser ↔ agent</strong> below.
          </li>
          <li>Then open Analyze and choose a video from this PC.</li>
        </ol>
        <details className="install-details">
          <summary>Advanced: show manual install commands</summary>
          <pre className="muted">{`cd apps/agent
python -m venv .venv
.\\.venv\\Scripts\\activate
pip install -r requirements.txt
python main.py`}</pre>
        </details>
        <p className="muted">Default helper-app address: <code>http://127.0.0.1:8787</code></p>
      </section>

      <section className="panel" id="pair">
        <h2>Pair</h2>
        <label>
          Agent URL
          <input
            className="d-input"
            value={url}
            onChange={(e) => {
              const nextUrl = e.target.value;
              urlRef.current = nextUrl;
              healthRequestRef.current += 1;
              setUrl(nextUrl);
              setHealth(null);
              setCode("");
              setChecking(false);
              setError(null);
              setStatus("");
              localStorage.setItem("bml.agentUrl", nextUrl);
            }}
          />
        </label>
        <label>
          Pairing code
          <input className="d-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="refresh health" />
        </label>
        <div className="row">
          <button className="d-btn d-btn-primary" onClick={() => void pair()} disabled={readiness !== "ready" || !code || pairing}>
            {pairing ? "Pairing…" : "Pair browser ↔ agent"}
          </button>
          <button
            className="d-btn d-btn-ghost"
            onClick={() => void refreshHealth()}
            disabled={checking}
          >
            Refresh health
          </button>
        </div>
        <p className="muted">Current base: {agentBaseUrl()}</p>
        {error ? <p className="status error" role="alert">{error}</p> : null}
        {status ? (
          <p className="status success" role="status">
            {status} <Link href="/analyze">Choose a video →</Link>
          </p>
        ) : null}
      </section>
    </main>
  );
}
