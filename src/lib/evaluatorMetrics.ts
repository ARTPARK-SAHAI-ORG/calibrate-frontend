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

/**
 * Formats an evaluator aggregate (or per-row score for rating) according to
 * its output type:
 * - binary  → success rate as a percentage  e.g. "60%"
 * - rating  → "mean/max" when a scale_max is known, else the bare number
 *
 * Used by the per-provider metrics card, the leaderboard table, and the
 * leaderboard chart tooltip so the surfaces all agree.
 */
export function formatEvaluatorAggregate(
  value: number | null | undefined,
  outputType: "binary" | "rating",
  scaleMax?: number | null,
): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  if (outputType === "binary") {
    return `${Math.round(value * 100)}%`;
  }
  const rounded = parseFloat(value.toFixed(4));
  if (typeof scaleMax === "number" && Number.isFinite(scaleMax)) {
    return `${rounded}/${scaleMax}`;
  }
  return `${rounded}`;
}

/**
 * Same as the aggregate formatter but for a single per-row value (already
 * coerced to a string by the row cell renderer). Returns the raw score string
 * untouched when scale info is missing so legacy payloads still render.
 */
export function formatEvaluatorRowValue(
  score: string,
  outputType: "binary" | "rating",
  scaleMax?: number | null,
): string {
  if (outputType === "binary") return score;
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return score;
  const rounded = parseFloat(numeric.toFixed(4));
  if (typeof scaleMax === "number" && Number.isFinite(scaleMax)) {
    return `${rounded}/${scaleMax}`;
  }
  return `${rounded}`;
}
