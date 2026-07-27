"use client";

import { useEffect, useState } from "react";
import { getModules, publicCompletenessFromSeed } from "@/lib/modules";
import {
  agentHealth,
  agentReadiness,
  type AgentHealthResult,
} from "@/lib/agent";
import Link from "next/link";

export default function HomePage() {
  const modules = getModules();
  const completeness = publicCompletenessFromSeed();
  const [health, setHealth] = useState<AgentHealthResult | null>(null);

  useEffect(() => {
    void agentHealth().then(setHealth);
  }, []);

  const technique = modules.filter((m) => m.kind === "technique_stroke");
  const footwork = modules.filter((m) => m.kind !== "technique_stroke");

  return (
    <main className="page-home">
      <header className="hero home-hero">
        <h1 className="brand">Read your game in motion.</h1>
        <p className="tag">
          Evidence-backed technique and footwork analysis, with the original video staying on your
          PC.
        </p>
        <div className="row hero-actions">
          <Link className="d-btn d-btn-primary" href="/analyze">Start an analysis</Link>
          <Link className="d-btn d-btn-ghost" href="/capture-guide">View capture guide</Link>
        </div>
      </header>

      {agentReadiness(health) === "offline" ? (
        <div className="notice" role="status">
          Agent offline: module catalogue remains available, but local session summaries and video
          review need the Local Agent. <Link href="/agent">Pair & start agent →</Link>
        </div>
      ) : null}

      {agentReadiness(health) === "not_ready" ? (
        <div className="notice" role="alert">
          Agent is running but a required prerequisite is missing. Open Local Agent to see the
          exact setup action before analyzing. <Link href="/agent">Check prerequisites →</Link>
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
                <span className={`d-badge status-badge ${m.status}`}>{m.status}</span>
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
                <span className={`d-badge status-badge ${m.status}`}>{m.status}</span>
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
