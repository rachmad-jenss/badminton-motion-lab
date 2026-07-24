export type SessionMetricPoint = {
  sessionId: string;
  sessionTitle: string;
  createdAt: string;
  metricId: string;
  value: number;
  unit: string;
};

export function compareLatest(
  points: SessionMetricPoint[],
  metricId: string,
): {
  metricId: string;
  previous: SessionMetricPoint | null;
  current: SessionMetricPoint | null;
  delta: number | null;
} {
  const series = points
    .filter((p) => p.metricId === metricId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const current = series.at(-1) ?? null;
  const previous = series.length > 1 ? series[series.length - 2] : null;
  const delta =
    current && previous ? Number((current.value - previous.value).toFixed(2)) : null;
  return { metricId, previous, current, delta };
}
