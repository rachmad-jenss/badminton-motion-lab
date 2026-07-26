import { AppNav } from "@/components/AppNav";

export default function CaptureGuidePage() {
  return (
    <main>
      <AppNav />

      <header className="hero">
        <h1 className="brand">Capture guide</h1>
        <p className="tag">
          Strict quality gate: videos below threshold are rejected before perception. This protects
          trust for stranger-ready use.
        </p>
      </header>

      <section className="panel">
        <h2>Required (side-ish full body v1)</h2>
        <ul className="muted">
          <li>Full body visible — head to feet</li>
          <li>Camera roughly side-on (yaw within ±35°)</li>
          <li>Minimum 1280×720 and 30 fps</li>
          <li>Usable lighting (not crushed blacks / blown highlights)</li>
        </ul>
      </section>

      <section className="panel">
        <h2>Footwork / court</h2>
        <p className="muted">
          Court calibration is semi-automatic (line detection). If auto fails, mark four corners.
          Without a valid court, Footwork modules stay withheld for that run.
        </p>
      </section>

      <section className="panel">
        <h2>Platform note</h2>
        <p className="muted">
          Public launch is <strong>Windows-only</strong>. macOS Local Agent follows as v1.1. Original
          video is not uploaded; the agent streams to the browser on localhost.
        </p>
      </section>

      <section className="panel">
        <h2>Next step</h2>
        <p className="muted">
          When the capture meets these requirements, pair the Local Agent and run the analysis.
        </p>
        <div className="row">
          <a className="btn" href="/agent">Pair Local Agent</a>
          <a className="btn secondary" href="/analyze">Go to Analyze</a>
        </div>
      </section>
    </main>
  );
}
