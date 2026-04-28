export type EvaluatorMetricColumnLike = {
  key: string;
  scoreField?: string;
};

export type ProviderEvaluatorMetricsLike = {
  evaluator_runs?: Array<{
    metric_key: string;
    aggregate?: { mean?: number | null } | null;
  }> | null;
  metrics?: Record<string, unknown> | null;
};

export function readProviderEvaluatorMean(
  col: EvaluatorMetricColumnLike,
  providerResult: ProviderEvaluatorMetricsLike,
): number | undefined {
  const run = providerResult.evaluator_runs?.find(
    (r) => r.metric_key === col.key,
  );
  if (run && typeof run.aggregate?.mean === "number") {
    return run.aggregate.mean;
  }

  const scoreField = col.scoreField ?? `${col.key}_score`;
  const flat = providerResult.metrics?.[scoreField];
  if (typeof flat === "number") return flat;

  const nested = providerResult.metrics?.[col.key];
  if (
    nested &&
    typeof nested === "object" &&
    "mean" in nested &&
    typeof nested.mean === "number"
  ) {
    return nested.mean;
  }

  return undefined;
}

export function formatMetricValue(value: unknown): string | number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return parseFloat(value.toFixed(4));
  }
  return "-";
}
