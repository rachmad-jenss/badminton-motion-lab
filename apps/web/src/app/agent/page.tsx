"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  agentBaseUrl,
  clearAgentToken,
  agentErrorMessage,
  agentHealth,
  agentNextAction,
  agentPost,
  agentReadiness,
  agentToken,
  setAgentToken,
  AgentRequestError,
  WINDOWS_STARTER_BUNDLE_URL,
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
  const [forgetting, setForgetting] = useState(false);
  const [paired, setPaired] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");
  const [nowEpoch, setNowEpoch] = useState(() => Math.floor(Date.now() / 1000));
  const [urlReady, setUrlReady] = useState(false);
  const urlRef = useRef(url);
  const healthRequestRef = useRef(0);

  function applyHealth(h: AgentHealthResult) {
    setHealth(h);
    const pairingCode = h.payload?.pairingCode;
    setCode(typeof pairingCode === "string" ? pairingCode : "");
    setCopyStatus("");
    if (!h.online) {
      setError("The local helper is not running yet. Install or start it above, then refresh this page.");
    }
  }

  useEffect(() => {
    setPaired(Boolean(agentToken()));
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
    setCopyStatus("");
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

  useEffect(() => {
    if (health?.payload?.pairingExpiresAt == null) return;
    const updateNow = () => setNowEpoch(Math.floor(Date.now() / 1000));
    updateNow();
    const timer = window.setInterval(updateNow, 1000);
    return () => window.clearInterval(timer);
  }, [health?.payload?.pairingExpiresAt]);

  async function pair() {
    if (!pairingAvailable) {
      setError("Get a new pairing code before pairing this browser.");
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
      setAgentToken(res.token, urlRef.current);
      setPaired(Boolean(agentToken(urlRef.current)));
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

  async function copyPairingCode() {
    if (!pairingAvailable) {
      setCopyStatus("Get a new pairing code before copying it.");
      return;
    }
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(code);
      setCopyStatus("Pairing code copied. Paste it into this setup page.");
    } catch {
      setCopyStatus("Copy is unavailable. Select the code and copy it manually.");
    }
  }

  async function forgetPairing() {
    setForgetting(true);
    setError(null);
    setStatus("");
    try {
      if (agentToken(urlRef.current)) await agentPost("/auth/revoke", {});
      setStatus("Browser pairing forgotten. Pair again before analyzing.");
    } catch (e) {
      if (!(e instanceof AgentRequestError && e.status === 401)) {
        setError(agentErrorMessage(e, "The agent could not revoke this pairing."));
      }
    } finally {
      clearAgentToken(urlRef.current);
      setPaired(false);
      setForgetting(false);
    }
  }

  const readiness = agentReadiness(health);
  const poseReady = health?.payload?.poseModelPresent !== false;
  const pairingCodeReady = typeof health?.payload?.pairingCode === "string";
  const pairingExpiresAt = health?.payload?.pairingExpiresAt;
  const pairingSecondsRemaining = typeof pairingExpiresAt === "number"
    ? Math.max(0, pairingExpiresAt - nowEpoch)
    : null;
  const pairingExpired = typeof pairingExpiresAt === "number" && pairingExpiresAt <= nowEpoch;
  const pairingAvailable = pairingCodeReady && !pairingExpired;
  const readyToAnalyze = readiness === "ready" && paired;
  const nextAction = agentNextAction(readiness, paired);
  const refreshPairingLabel = readiness === "offline" ? "Refresh after starting helper" : "Get a new pairing code";
  const checks = [
    { label: "Helper app", ok: health?.online === true },
    { label: "Video model", ok: health?.payload?.poseModelPresent !== false && health?.online === true },
    { label: "Browser pairing", ok: paired },
  ];

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Setup on this PC</h1>
        <p className="tag">
          Install the local helper on this PC, pair this browser, then choose a video. Your original
          video stays on this PC.
        </p>
        <div className="row hero-actions">
          <span className={`d-badge status-badge ${readyToAnalyze ? "on" : "experimental"}`}>
            {checking
              ? "Checking setup…"
              : readyToAnalyze
                ? "Ready to analyze"
                : readiness === "offline"
                  ? "Install local helper"
                  : "Experimental — Setup needs attention"}
          </span>
          <Link className="d-btn d-btn-primary" href={nextAction.href}>
            {nextAction.label}
          </Link>
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
            ? "Install the helper below, start it, then refresh this setup check."
            : !poseReady
              ? "Install the missing video model before analyzing."
              : !pairingCodeReady
                ? "Refresh this setup check to get a one-time pairing code."
                : !paired
                  ? "Pair this browser below, then open Analyze video and choose a video."
                  : "Pairing is complete. Open Analyze video and choose a video."}
        </p>
      </section>

      <section className="panel" id="install" aria-labelledby="install-heading">
        <h2 id="install-heading">Install the helper on Windows</h2>
        <p>
          New to this app? You do not need to find a project folder. Download the starter bundle,
          extract it, and run one setup file.
        </p>
        <p>
          <a
            className="d-btn d-btn-primary"
            href={WINDOWS_STARTER_BUNDLE_URL}
            target="_blank"
            rel="noreferrer"
          >
            Download Windows starter bundle
          </a>
        </p>
        <ol className="muted">
          <li>Download the ZIP to this Windows computer.</li>
          <li>Open Downloads, right-click the ZIP, and choose <strong>Extract All</strong>.</li>
          <li>
            Open the extracted folder, then <code>infra</code> → <code>windows</code>, and double-click
            <code>install-agent.cmd</code>.
          </li>
        </ol>
        <p className="muted">
          Setup may install Python and FFmpeg and download the video model. Keep the helper console
          open. When it says the Local Agent is healthy, return here and refresh this page.
        </p>
        <details className="install-details">
          <summary>For developers: use a project checkout</summary>
          <p className="muted">
            Use this only if you already cloned the repository or received the project folder.
          </p>
          <pre className="muted">{`cd apps/agent
python -m venv .venv
.\\.venv\\Scripts\\activate
pip install -r requirements.txt
python main.py`}</pre>
        </details>
      </section>

      <section className="panel" id="pair">
        <h2>Connect this browser</h2>
        <p className="muted">After the helper is healthy, refresh this page to receive a one-time pairing code.</p>
        <details className="install-details">
          <summary>Advanced: use a different Local Agent address</summary>
          <label>
            Agent URL
            <input
              className="d-input"
              value={url}
              onChange={(e) => {
                const nextUrl = e.target.value;
                const previousUrl = urlRef.current;
                if (nextUrl.trim() !== previousUrl.trim()) {
                  clearAgentToken(previousUrl);
                  clearAgentToken(nextUrl);
                  setPaired(false);
                }
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
          <p className="muted">Most people can leave this unchanged. Default: <code>http://127.0.0.1:8787</code></p>
          <p className="muted">Current helper address: {agentBaseUrl()}</p>
        </details>
        <label>
          Pairing code
          <div className="row">
            <input
              className="d-input"
              value={code}
              readOnly
              aria-describedby="pairing-help"
              placeholder="Waiting for the helper app"
            />
            <button className="d-btn d-btn-ghost" type="button" onClick={() => void copyPairingCode()} disabled={!pairingAvailable}>
              Copy pairing code
            </button>
          </div>
          <span id="pairing-help" className="muted">
            {pairingExpired
              ? "Pairing code expired or unavailable. Get a new pairing code."
              : pairingSecondsRemaining == null || !pairingCodeReady
                ? readiness === "offline"
                  ? "Start the helper above, then refresh this page."
                  : "Get a new one-time pairing code from the Local Agent."
                : `Pairing code expires in ${pairingSecondsRemaining >= 60 ? `${Math.ceil(pairingSecondsRemaining / 60)} min` : `${pairingSecondsRemaining} sec`}.`}
          </span>
          {copyStatus ? <span className="status" role="status">{copyStatus}</span> : null}
        </label>
        <div className="row">
          <button className="d-btn d-btn-primary" onClick={() => void pair()} disabled={readiness !== "ready" || !pairingAvailable || pairing}>
            {pairing ? "Pairing…" : "Pair browser ↔ agent"}
          </button>
          <button
            className="d-btn d-btn-ghost"
            onClick={() => void refreshHealth()}
            disabled={checking}
          >
            {refreshPairingLabel}
          </button>
          {paired ? (
            <button className="d-btn d-btn-ghost" onClick={() => void forgetPairing()} disabled={forgetting}>
              {forgetting ? "Forgetting…" : "Forget browser pairing"}
            </button>
          ) : null}
        </div>
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
