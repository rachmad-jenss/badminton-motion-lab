"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { METRIC_CATALOGUE } from "@bml/contracts";
import {
  agentErrorMessage,
  agentGet,
  agentHealth,
  agentReadiness,
  agentReadinessLabel,
  agentToken,
  type AgentHealthResult,
} from "@/lib/agent";
import { compareLatest, type SessionMetricPoint } from "@/lib/compare";

const METRICS = [
  "elbow_angle_contact",
  "shoulder_abduction_contact",
  "split_step_timing_to_contact",
  "racket_speed_proxy_contact",
] as const;

function metricDefinition(id: string) {
  return METRIC_CATALOGUE.find((metric) => metric.id === id);
}

function metricLabel(id: string): string {
  return metricDefinition(id)?.name ?? id;
}

function formatValue(point: SessionMetricPoint | null): string {
  return point ? `${point.value} ${point.unit} · ${point.sessionTitle}` : "-";
}

export default function ComparePage() {
  const [health, setHealth] = useState<AgentHealthResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seriesErrors, setSeriesErrors] = useState<Record<string, string>>({});
  const [series, setSeries] = useState<Record<string, SessionMetricPoint[]>>({});
  const [loading, setLoading] = useState(true);
  const [paired, setPaired] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSeriesErrors({});
    const nextHealth = await agentHealth();
    setHealth(nextHealth);
    const hasToken = Boolean(agentToken());
    setPaired(hasToken);
    if (!nextHealth.online) {
      setError("Setup is offline - start the helper app to load real progress.");
      setSeries({});
      setLoading(false);
      return;
    }
    if (!hasToken) {
      setError("Pair this browser with setup to load your progress.");
      setSeries({});
      setLoading(false);
      return;
    }

    const results = await Promise.all(
      METRICS.map(async (id) => {
        try {
          const response = await agentGet<{ points: SessionMetricPoint[] }>(
            `/metrics/series?metric_id=${encodeURIComponent(id)}&limit=200`,
          );
          return { id, points: response.points, error: null };
        } catch (e) {
          return { id, points: [], error: agentErrorMessage(e, "Could not load this metric.") };
        }
      }),
    );

    setSeries(Object.fromEntries(results.map(({ id, points }) => [id, points])));
    setSeriesErrors(
      Object.fromEntries(
        results.filter((item) => item.error).map(({ id, error: itemError }) => [id, itemError ?? "Metric unavailable"]),
      ),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const readiness = agentReadiness(health);
  const hasAnyData = METRICS.some((id) => (series[id] || []).length > 0);

  return (
    <main className="page-tool">
      <header className="hero">
        <h1 className="brand">Your progress</h1>
        <p className="tag">
          See how your measurements change across real analysis runs stored on this PC. A change is
          shown neutrally unless the measurement has a clear better direction.
        </p>
        <div className="row hero-actions">
          <span className={`d-badge status-badge ${readiness === "ready" ? "on" : "locked"}`}>
            {agentReadinessLabel(readiness)}
          </span>
          <button className="d-btn d-btn-ghost" onClick={() => void load()} disabled={loading}>
            {loading ? "Refreshing…" : "Refresh"}
          </button>
          <Link className="d-btn d-btn-ghost" href="/analyze">
            Analyze another video
          </Link>
        </div>
      </header>

      {error ? <div className="notice" role="status">{error} <Link href="/agent">Open setup →</Link></div> : null}
      {loading ? <p className="muted" role="status">Loading session series…</p> : null}
      {Object.keys(seriesErrors).length > 0 ? (
        <div className="notice" role="alert">
          Some metrics could not be loaded. Available metrics remain visible below.
        </div>
      ) : null}

      {!loading && readiness !== "offline" && paired ? (
        <section className="panel">
          <h2>Latest vs previous</h2>
          {!hasAnyData && Object.keys(seriesErrors).length === 0 ? (
            <p className="muted">No runs yet - analyze a local video first.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Metric</th>
                    <th>Previous</th>
                    <th>Current</th>
                    <th>Change</th>
                    <th>Sessions</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((id) => {
                    const points = series[id] || [];
                    const comparison = compareLatest(points, id);
                    const definition = metricDefinition(id);
                    return (
                      <tr key={id}>
                        <td className="metric-name">
                          <span>{metricLabel(id)}</span>
                          <small>{definition?.description ?? id}</small>
                        </td>
                        <td>{formatValue(comparison.previous)}</td>
                        <td>{formatValue(comparison.current)}</td>
                        <td>
                          {seriesErrors[id]
                            ? seriesErrors[id]
                            : comparison.delta == null
                              ? "-"
                              : `${comparison.delta >= 0 ? "+" : ""}${comparison.delta} ${comparison.current?.unit ?? ""}`}
                        </td>
                        <td>{points.length}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : null}

      {!loading && readiness !== "offline" && paired && hasAnyData ? (
        <section className="panel">
            <h2>Progress over time</h2>
          {METRICS.map((id) => {
            const points = [...(series[id] || [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            if (points.length === 0) return null;
            const max = Math.max(...points.map((point) => Math.abs(point.value)), 1);
            return (
              <div key={id} className="trend-group">
                <p className="metric-name">
                  <strong>{metricLabel(id)}</strong>
                  <small>{metricDefinition(id)?.description ?? id}</small>
                </p>
                <div className="trend-scroll">
                  <div className="row trend-chart">
                    {points.map((point) => (
                      <div key={`${point.sessionId}-${id}`} className="trend-point">
                        <div
                          className="trend-bar"
                          aria-label={`${point.sessionTitle}: ${point.value} ${point.unit}`}
                          title={`${point.sessionTitle}: ${point.value} ${point.unit}`}
                          style={{
                            "--bar-height": `${Math.max(4, (Math.abs(point.value) / max) * 100)}px`,
                          } as CSSProperties & Record<"--bar-height", string>}
                        />
                        <div className="muted trend-label">
                          {point.sessionTitle.slice(0, 10)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}
    </main>
  );
}
