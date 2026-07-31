import Link from "next/link";

export default function CaptureGuidePage() {
  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">How to record a good video</h1>
        <p className="tag">
          A clear side-on video gives the most useful movement feedback. The app checks the video
          before measuring anything.
        </p>
        <div className="row hero-actions">
          <Link className="d-btn d-btn-primary" href="/agent">
            Open setup
          </Link>
          <Link className="d-btn d-btn-ghost" href="/analyze">
            Choose a video
          </Link>
        </div>
      </header>

      <section className="panel">
        <h2>Record this way</h2>
        <ul className="muted">
          <li>Keep the whole player in frame, from head to feet.</li>
          <li>Place the camera to the side, not directly in front or behind.</li>
          <li>Use steady camera support and enough light to see the player clearly.</li>
          <li>Record a short clip with the full movement, including the contact moment.</li>
        </ul>
        <p className="muted">
          If court lines cannot be found, footwork measurements may be withheld. You can still
          review technique findings when they are available.
        </p>
      </section>

      <section className="panel">
        <h2>What happens next</h2>
        <p className="muted">
          Start the helper app, pair this browser, then choose the video from this PC. The original
          video is not uploaded.
        </p>
        <p className="muted">
          This first version supports Windows. Your video is read locally by the helper app.
        </p>
        <details className="install-details">
          <summary>Technical requirements</summary>
          <ul className="muted">
            <li>At least 1280 × 720 resolution and 30 frames per second.</li>
            <li>Side angle within roughly 35 degrees of a true side view.</li>
            <li>Lighting between the automatic brightness limits.</li>
          </ul>
        </details>
      </section>
    </main>
  );
}
