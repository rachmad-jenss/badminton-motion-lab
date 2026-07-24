"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getModules, publicCompletenessFromSeed } from "@/lib/modules";
import { agentHealth } from "@/lib/agent";

export default function HomePage() {
  const modules = getModules();
  const completeness = publicCompletenessFromSeed();
  const [agentOnline, setAgentOnline] = useState<boolean | null>(null);

  useEffect(() => {
    void agentHealth().then((h) => setAgentOnline(h.online));
  }, []);

  const technique = modules.filter((m) => m.kind === "technique_stroke");
  const footwork = modules.filter((m) => m.kind !== "technique_stroke");

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
        <p className="badge">Windows-only at launch · macOS later</p>
        <h1 className="brand">Badminton Motion Lab</h1>
        <p className="tag">
          Technique Lab (all strokes) and Footwork Lab with evidence-backed metrics.
          Original video stays on your PC. Analysis runs on the Local Agent; the web app
          is the control plane.
        </p>
        <div className="badge-row">
          <span className={`badge ${completeness.complete ? "on" : "locked"}`}>
            Public completeness: {completeness.complete ? "READY (0 locked)" : `${completeness.locked.length} locked`}
          </span>
          <span className={`badge ${agentOnline ? "on" : "locked"}`}>
            Local Agent: {agentOnline == null ? "checking…" : agentOnline ? "online" : "offline — Start Agent"}
          </span>
        </div>
      </header>

      {!agentOnline && agentOnline !== null ? (
        <div className="notice">
          Agent offline: you can still browse module catalogue and session metric summaries.
          Video scrub / skeleton requires the Local Agent streaming on localhost.{" "}
          <Link href="/agent">Pair & start agent →</Link>
        </div>
      ) : null}

      {completeness.complete ? (
        <div className="ok-notice notice">
          All Technique + Footwork modules are <strong>on</strong> after fixture benchmarks.
          Stranger-ready public gate satisfied for this build.
        </div>
      ) : (
        <div className="notice">
          Private assembly mode: UI shows every module. Locked modules stay unavailable until
          each module&apos;s benchmark gate passes.
        </div>
      )}

      <section className="panel">
        <h2>Technique Lab</h2>
        <div className="grid">
          {technique.map((m) => (
            <article key={m.moduleId} className="module">
              <div className="row">
                <span className={`badge ${m.status}`}>{m.status}</span>
              </div>
              <h3>{m.label}</h3>
              <p>Body + racket + shuttle · event detector · own benchmark</p>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Footwork Lab</h2>
        <div className="grid">
          {footwork.map((m) => (
            <article key={m.moduleId} className="module">
              <div className="row">
                <span className={`badge ${m.status}`}>{m.status}</span>
              </div>
              <h3>{m.label}</h3>
              <p>
                {m.kind === "footwork_pure"
                  ? "Pure drill mode · court calibration required"
                  : "Layer on technique stroke · court required"}
              </p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
