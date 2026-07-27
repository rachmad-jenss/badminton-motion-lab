"use client";

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
    { label: "Agent process", ok: health?.online === true },
    { label: "Pose model", ok: health?.payload?.poseModelPresent !== false && health?.online === true },
    { label: "Pairing challenge", ok: typeof health?.payload?.pairingCode === "string" },
  ];

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Local Agent</h1>
        <p className="tag">
          Download/install the Windows agent, start it, then pair this browser. The agent streams
          media on localhost and keeps BYOK keys off the cloud.
        </p>
        <div className="row hero-actions">
          <span className={`d-badge status-badge ${readiness === "ready" ? "on" : "locked"}`}>
            {checking ? "Checking Agent…" : readiness === "ready" ? "Agent ready" : "Agent needs attention"}
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
        <h2>Readiness</h2>
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
            ? "Start the Windows Local Agent, then refresh health."
            : !poseReady
              ? "Install the missing pose model before analyzing."
              : !pairingReady
                ? "Refresh health to obtain a live pairing code, then pair this browser."
                : "The browser can use local media only when these checks are ready."}
        </p>
      </section>

      <section className="panel">
        <h2>Install (Windows)</h2>
        <ol className="muted">
          <li>
            Run <code>infra/windows/install-agent.ps1</code> or start manually from{" "}
            <code>apps/agent</code>.
          </li>
          <li>
            Default URL: <code>http://127.0.0.1:8787</code>
          </li>
          <li>Return here and pair with a short code.</li>
        </ol>
        <details className="install-details">
          <summary>Show install commands</summary>
          <pre className="muted">{`cd apps/agent
python -m venv .venv
.\\.venv\\Scripts\\activate
pip install -r requirements.txt
python main.py`}</pre>
        </details>
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
        {status ? <p className="status success" role="status">{status}</p> : null}
      </section>
    </main>
  );
}
