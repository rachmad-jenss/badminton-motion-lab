"use client";

import { useEffect, useState } from "react";
import { getModules, publicCompletenessFromSeed } from "@/lib/modules";
import {
  agentHealth,
  agentReadiness,
  agentToken,
  type AgentHealthResult,
} from "@/lib/agent";
import { OnboardingSteps } from "@/components/OnboardingSteps";
import Link from "next/link";

function moduleStatusLabel(status: string): string {
  return status === "on" ? "Ready" : "In review";
}

export default function HomePage() {
  const modules = getModules();
  const completeness = publicCompletenessFromSeed();
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [paired, setPaired] = useState(false);

  useEffect(() => {
    setPaired(Boolean(agentToken()));
    void agentHealth().then(setHealth);
  }, []);

  const technique = modules.filter((m) => m.kind === "technique_stroke");
  const footwork = modules.filter((m) => m.kind !== "technique_stroke");
  const readiness = agentReadiness(health);
  const primaryHref = readiness === "ready" && paired ? "/analyze" : "/agent";
  const primaryLabel =
    readiness === "ready" && paired
      ? "Choose a video"
      : readiness === "not_ready"
        ? "Finish setup"
        : readiness === "checking"
          ? "Check setup"
          : "Set up on this PC";

  return (
    <main className="page-home">
      <header className="hero home-hero">
        <h1 className="brand">Read your game in motion.</h1>
        <p className="tag">
          Evidence-backed technique and footwork analysis, with the original video staying on your
          PC.
        </p>
        <div className="row hero-actions">
          <Link className="d-btn d-btn-primary" href={primaryHref}>{primaryLabel}</Link>
          <Link className="d-btn d-btn-ghost" href="/capture-guide">How to record a good video</Link>
        </div>
      </header>

      {readiness === "offline" ? (
        <div className="notice" role="status">
          Setup is not running yet. Start it to analyze and review a video on this PC. <Link href="/agent">Open setup →</Link>
        </div>
      ) : null}

      <OnboardingSteps readiness={readiness} paired={paired} />

      {readiness === "not_ready" ? (
        <div className="notice" role="alert">
          Setup is almost ready. Check the helper app, video model, and browser pairing before analyzing. <Link href="/agent">Check setup →</Link>
        </div>
      ) : null}

      {completeness.complete ? (
        <div className="ok-notice notice">
          All Technique + Footwork modules are <strong>on</strong> after fixture benchmarks.
          Stranger-ready public gate satisfied for this build.
        </div>
      ) : null}

      <section className="panel">
        <h2>Technique Lab</h2>
        {!completeness.complete ? (
          <p className="muted labs-note">
            Some analysis areas are still in review. They will appear here when their measurements
            are ready; you can still use the available areas below.
          </p>
        ) : null}
        <div className="lab-list">
          {technique.map((m) => (
            <article key={m.moduleId} className="lab-row">
              <div className="lab-row-copy">
                <h3>{m.label}</h3>
                <p>Body, racket, and shuttle movement</p>
              </div>
              <span className={`d-badge status-badge ${m.status}`}>{moduleStatusLabel(m.status)}</span>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Footwork Lab</h2>
        <div className="lab-list">
          {footwork.map((m) => (
            <article key={m.moduleId} className="lab-row">
              <div className="lab-row-copy">
                <h3>{m.label}</h3>
                <p>
                  {m.kind === "footwork_pure"
                    ? "Footwork-only practice; court setup helps"
                    : "Footwork during a stroke; court setup helps"}
                </p>
              </div>
              <span className={`d-badge status-badge ${m.status}`}>{moduleStatusLabel(m.status)}</span>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
