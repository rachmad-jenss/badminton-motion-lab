"use client";

import { useCallback, useEffect, useState } from "react";
import {
  agentBaseUrl,
  agentErrorMessage,
  agentHealth,
  agentPost,
  agentReadiness,
  setAgentToken,
  type AgentHealthResult,
} from "@/lib/agent";
import { AppNav } from "@/components/AppNav";

export default function AgentPage() {
  const [url, setUrl] = useState("http://127.0.0.1:8787");
  const [code, setCode] = useState("");
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [pairing, setPairing] = useState(false);
  const [urlReady, setUrlReady] = useState(false);

  function applyHealth(h: AgentHealthResult) {
    setHealth(h);
    const pairingCode = h.payload?.pairingCode;
    setCode(typeof pairingCode === "string" ? pairingCode : "");
    if (!h.online) setError(h.error || "Local Agent is offline.");
  }

  useEffect(() => {
    const saved = localStorage.getItem("bml.agentUrl");
    if (saved) setUrl(saved);
    setUrlReady(true);
  }, []);

  useEffect(() => {
    if (urlReady) localStorage.setItem("bml.agentUrl", url);
  }, [url, urlReady]);

  const refreshHealth = useCallback(async () => {
    setChecking(true);
    setError(null);
    setStatus("");
    try {
      applyHealth(await agentHealth());
    } finally {
      setChecking(false);
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
      setStatus("Paired locally. Keep the agent running while reviewing video.");
      await refreshHealth();
    } catch (e) {
      setError(agentErrorMessage(e, "Pairing failed. Refresh the code and try again."));
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
    <main>
      <AppNav />

      <header className="hero">
        <h1 className="brand">Local Agent</h1>
        <p className="tag">
          Download/install the Windows agent, start it, then pair this browser. The agent streams
          media on localhost and keeps BYOK keys off the cloud.
        </p>
        <span className={`badge ${readiness === "ready" ? "on" : "locked"}`}>
          {checking ? "Checking Agent…" : readiness === "ready" ? "Agent ready" : "Agent needs attention"}
        </span>
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
        <pre className="muted">{`cd apps/agent
python -m venv .venv
.\\.venv\\Scripts\\activate
pip install -r requirements.txt
python main.py`}</pre>
      </section>

      <section className="panel">
        <h2>Pair</h2>
        <label>
          Agent URL
          <input value={url} onChange={(e) => setUrl(e.target.value)} />
        </label>
        <label>
          Pairing code
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="refresh health" />
        </label>
        <div className="row">
          <button className="btn" onClick={() => void pair()} disabled={readiness !== "ready" || !code || pairing}>
            {pairing ? "Pairing…" : "Pair browser ↔ agent"}
          </button>
          <button
            className="btn secondary"
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
