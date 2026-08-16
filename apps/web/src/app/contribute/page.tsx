import Link from "next/link";

export default function ContributePage() {
  return (
    <main className="page-contribute">
      <h1>Help improve the measurements</h1>
      <p className="tag">
        Badminton Motion Lab is in beta. Every module is locked until real badminton footage
        proves the pipeline measures it correctly. Your videos can speed that up without ever
        leaving your PC.
      </p>

      <section className="panel">
        <h2>The honest rule</h2>
        <p>
          Locked modules are not a limitation to hide: they mean no fabricated score. A module
          unlocks only when both kinds of evidence pass — broadcast footage for event timing and
          own-capture clips for body measurements (Plan 028).
        </p>
      </section>

      <section className="panel">
        <h2>Your video stays on your PC</h2>
        <p>
          The Local Agent processes everything locally. If you opt in, the only thing sent is the
          measured report JSON — never the video, never the dense pose series. Reports can be
          anonymized before sharing.
        </p>
      </section>

      <section className="panel">
        <h2>How to contribute</h2>
        <ol>
          <li>Record a side-ish full-body clip following the capture guide.</li>
          <li>Run an analysis and review the results.</li>
          <li>Export the report from the results view and share it (report only).</li>
          <li>Optionally, label the contact frame and court corners to make it ground truth.</li>
        </ol>
        <p>
          Maintainer tool: <Link href="/label">Label a capture →</Link>
        </p>
      </section>

      <section className="panel">
        <h2>Dataset attribution</h2>
        <p>
          Event evidence uses the ShuttleSet singles dataset. Fine-Badminton is research-only and
          is never used as release evidence. See validation/DATASET_ATTRIBUTION.md in the
          repository for full attribution and license notes.
        </p>
      </section>
    </main>
  );
}

