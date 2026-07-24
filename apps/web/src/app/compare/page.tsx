"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { agentGet, agentHealth } from "@/lib/agent";
import { compareLatest, type SessionMetricPoint } from "@/lib/compare";

const METRICS = [
  "elbow_angle_contact",
  "shoulder_abduction_contact",
  "split_step_timing_to_contact",
  "racket_speed_proxy_contact",
] as const;

export default function ComparePage() {
  const [online, setOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [series, setSeries] = useState<Record<string, SessionMetricPoint[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const health = await agentHealth();
    setOnline(health.online);
    if (!health.online) {
      setError("Local Agent offline — Start Agent to load real session metrics.");
      setSeries({});
      setLoading(false);
      return;
    }
    try {
      const next: Record<string, SessionMetricPoint[]> = {};
      for (const id of METRICS) {
        const res = await agentGet<{ points: SessionMetricPoint[] }>(
          `/metrics/series?metric_id=${encodeURIComponent(id)}`,
        );
        next[id] = res.points;
      }
      setSeries(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main>
      <nav className="app-nav">
        <Link href="/">Labs</Link>
        <Link href="/analyze">Analyze</Link>
        <Link href="/compare">Compare</Link>
        <Link href="/agent">Local Agent</Link>
      </nav>

      <header className="hero">
        <h1 className="brand">Session compare</h1>
        <p className="tag">
          Deltas from analysis runs stored on your Local Agent (real metrics only — no demo
          dataset).
        </p>
        <div className="row">
          <span className={`badge ${online ? "on" : "locked"}`}>
            Agent {online ? "online" : "offline"}
          </span>
          <button className="btn secondary" onClick={() => void load()}>
            Refresh
          </button>
        </div>
      </header>

      {error ? <div className="notice">{error}</div> : null}
      {loading ? <p className="muted">Loading series…</p> : null}

      {!loading && !error ? (
        <section className="panel">
          <h2>Latest vs previous</h2>
          <table>
            <thead>
              <tr>
                <th>Metric</th>
                <th>Previous</th>
                <th>Current</th>
                <th>Delta</th>
                <th>Points</th>
              </tr>
            </thead>
            <tbody>
              {METRICS.map((id) => {
                const points = series[id] || [];
                const c = compareLatest(points, id);
                return (
                  <tr key={id}>
                    <td>{id}</td>
                    <td>
                      {c.previous ? `${c.previous.value} (${c.previous.sessionTitle})` : "—"}
                    </td>
                    <td>
                      {c.current ? `${c.current.value} (${c.current.sessionTitle})` : "—"}
                    </td>
                    <td className={c.delta != null && c.delta >= 0 ? "delta-up" : "delta-down"}>
                      {c.delta == null ? "—" : c.delta >= 0 ? `+${c.delta}` : c.delta}
                    </td>
                    <td>{points.length}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {METRICS.every((id) => (series[id] || []).length === 0) ? (
            <p className="muted">No runs yet — analyze a local video first.</p>
          ) : null}
        </section>
      ) : null}

      {!loading && !error ? (
        <section className="panel">
          <h2>Trend</h2>
          {METRICS.map((id) => {
            const points = [...(series[id] || [])].sort((a, b) =>
              a.createdAt.localeCompare(b.createdAt),
            );
            if (points.length === 0) return null;
            const max = Math.max(...points.map((s) => s.value), 1);
            return (
              <div key={id} style={{ marginBottom: "1.25rem" }}>
                <p className="muted">{id}</p>
                <div className="row" style={{ alignItems: "end", height: 120, gap: "0.5rem" }}>
                  {points.map((s) => (
                    <div key={s.sessionId + id} style={{ textAlign: "center" }}>
                      <div
                        style={{
                          width: 48,
                          height: `${(s.value / max) * 100}px`,
                          background: "rgba(61,220,151,0.55)",
                          margin: "0 auto",
                        }}
                        title={`${s.value}`}
                      />
                      <div className="muted" style={{ fontSize: "0.75rem" }}>
                        {s.sessionTitle.slice(0, 10)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
