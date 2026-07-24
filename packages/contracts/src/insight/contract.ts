import type { InsightRequest, InsightResponse, StructuredFinding } from "../schemas/analysis.js";

export const INSIGHT_SYSTEM_PROMPT = `You are a badminton motion analyst assistant.
You ONLY explain structured findings and metrics already computed by the deterministic pipeline.
Rules:
- Never invent numeric values that are not present in the input JSON.
- Never claim medical diagnosis or injury risk.
- Cite finding IDs you rely on.
- If confidence is low or a metric is withheld, say so explicitly.
- Separate measurement from coaching judgment.`;

export function buildInsightUserPayload(request: InsightRequest): string {
  return JSON.stringify(
    {
      locale: request.locale,
      findings: request.findings,
      metrics: request.metrics.filter((m) => !m.withheld),
      withheldMetricIds: request.metrics.filter((m) => m.withheld).map((m) => m.metricId),
    },
    null,
    2,
  );
}

export function assertNoFabricatedMetrics(
  findings: StructuredFinding[],
  allowedMetricIds: Set<string>,
): void {
  for (const f of findings) {
    for (const id of f.metricIds) {
      if (!allowedMetricIds.has(id)) {
        throw new Error(`Finding ${f.id} references unknown metric ${id}`);
      }
    }
  }
}

export function emptyInsightStub(request: InsightRequest): InsightResponse {
  const lines = request.findings.map(
    (f) => `- (${f.id}, conf=${f.confidence.toFixed(2)}) ${f.title}: ${f.observation}`,
  );
  return {
    prose:
      lines.length === 0
        ? "No structured findings available to explain."
        : `Based only on computed findings:\n${lines.join("\n")}`,
    citedFindingIds: request.findings.map((f) => f.id),
    provider: "local-stub",
    model: "deterministic-summary",
    fabricatedMetricsAttempted: false,
  };
}
