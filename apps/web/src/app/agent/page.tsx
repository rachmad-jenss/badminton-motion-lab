"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { agentBaseUrl, agentHealth, agentPost, setAgentToken } from "@/lib/agent";

export default function AgentPage() {
  const [url, setUrl] = useState("http://127.0.0.1:8787");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<string>("");
  const [online, setOnline] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("bml.agentUrl");
    if (saved) setUrl(saved);
  }, []);

  useEffect(() => {
    localStorage.setItem("bml.agentUrl", url);
    void agentHealth().then((h) => {
      setOnline(h.online);
      setStatus(h.online ? JSON.stringify(h.payload, null, 2) : h.error || "offline");
    });
  }, [url]);

  async function pair() {
    const res = await agentPost<{ deviceId: string; token: string; agentUrl: string }>("/pair", {
      pairing_code: code || `BML-${Date.now()}`,
      device_name: "Windows Local Agent",
    });
    setAgentToken(res.token);
    setStatus(JSON.stringify({ ...res, token: `${res.token.slice(0, 8)}…` }, null, 2));
    alert("Paired locally. Token stored in this browser. Keep the agent running while reviewing video.");
  }

  return (
    <main>
      <nav className="app-nav">
        <Link href="/">Labs</Link>
        <Link href="/analyze">Analyze</Link>
        <Link href="/compare">Compare</Link>
        <Link href="/agent">Local Agent</Link>
        <Link href="/capture-guide">Capture guide</Link>
      </nav>

      <header className="hero">
        <h1 className="brand">Local Agent</h1>
        <p className="tag">
          Download/install the Windows agent, start it, then pair this browser. The agent streams
          media on localhost and keeps BYOK keys off the cloud.
        </p>
        <span className={`badge ${online ? "on" : "locked"}`}>
          {online ? "Agent online" : "Agent offline — Start Agent"}
        </span>
      </header>

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
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="optional" />
        </label>
        <div className="row">
          <button className="btn" onClick={() => void pair()} disabled={!online}>
            Pair browser ↔ agent
          </button>
          <button
            className="btn secondary"
            onClick={() =>
              void agentHealth().then((h) => {
                setOnline(h.online);
                setStatus(h.online ? JSON.stringify(h.payload, null, 2) : h.error || "offline");
              })
            }
          >
            Refresh health
          </button>
        </div>
        <p className="muted">Current base: {agentBaseUrl()}</p>
        <pre style={{ whiteSpace: "pre-wrap" }}>{status}</pre>
      </section>
    </main>
  );
}
