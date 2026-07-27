import Link from "next/link";

export default function CaptureGuidePage() {
  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Capture Guide</h1>
        <p className="tag">
          Strict quality gate: videos below threshold are rejected before perception. This protects
          trust for stranger-ready use.
        </p>
        <div className="row hero-actions">
          <Link className="d-btn d-btn-primary" href="/agent">
            Pair Local Agent
          </Link>
          <Link className="d-btn d-btn-ghost" href="/analyze">
            Go to Analyze
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2>Required capture</h2>
        <ul className="muted">
          <li>Full body visible — head to feet</li>
          <li>Camera roughly side-on (yaw within ±35°)</li>
          <li>Minimum 1280×720 and 30 fps</li>
          <li>Usable lighting (not crushed blacks / blown highlights)</li>
        </ul>
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
        <p className="muted">
          When the capture meets these requirements, pair the Local Agent and run the analysis.
        </p>
      </section>
    </main>
  );
}
