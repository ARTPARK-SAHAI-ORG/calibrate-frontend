/**
 * Display formatters for the latency / cost numbers the backend now returns
 * for LLM test-runs and benchmarks. Shared by the single-model test summary
 * and the benchmark leaderboard so the two always format the same way.
 */

/**
 * Aggregate latency / cost block returned by the backend (same shape for
 * test-runs and per-model benchmarks). `count` is how many cases actually
 * reported a value — it can be lower than the total test count (a "partial
 * data" hint) and is never zero-filled. The whole block is `null` for
 * eval-only runs or before `metrics.json` lands; cost is also `null` for the
 * `openai` provider. Always null-check.
 */
export type AggStat = {
  mean: number;
  min: number;
  max: number;
  count: number;
} | null;

/**
 * Aggregate latency block for LLM test-runs / per-model benchmarks. The backend
 * now reports latency as percentiles (`p50` / `p95` / `p99`) rather than
 * `mean` / `min` / `max`; use `p50` as the headline "average". Runs created
 * before the switch still carry the old `mean` / `min` / `max` keys, so those
 * stay optional here and the `latencyP50` / `latencySubtitle` helpers read both
 * shapes (`p50 ?? mean`). `count` is unchanged. The whole block is `null` for
 * eval-only runs or before metrics land — always null-check. Note: cost and
 * token aggregates did NOT change and still use `AggStat`.
 */
export type LatencyStat = {
  p50?: number;
  p95?: number;
  p99?: number;
  count: number;
  /** Legacy percentile-less keys, present only on historical runs. */
  mean?: number;
  min?: number;
  max?: number;
} | null;

/** Headline latency value: `p50` for new runs, falling back to the legacy
 * `mean` for runs generated before the percentile switch. */
export function latencyP50(
  latency: LatencyStat | undefined,
): number | null | undefined {
  if (!latency) return undefined;
  return latency.p50 ?? latency.mean;
}

/**
 * Caption shown under a latency card: the `p95` / `p99` tail for new runs, or
 * the legacy `min`–`max` range for historical ones. Returns undefined for a
 * single sample (or when there's nothing useful to show) so the caller can
 * skip the subtitle entirely.
 */
export function latencySubtitle(
  latency: LatencyStat | undefined,
): string | undefined {
  if (!latency || latency.count <= 1) return undefined;
  if (latency.p95 != null || latency.p99 != null) {
    const parts: string[] = [];
    if (latency.p95 != null) parts.push(`p95 ${formatLatencyMs(latency.p95)}`);
    if (latency.p99 != null) parts.push(`p99 ${formatLatencyMs(latency.p99)}`);
    return parts.join(" · ");
  }
  if (
    latency.min != null &&
    latency.max != null &&
    latency.min !== latency.max
  ) {
    return `${formatLatencyMs(latency.min)} – ${formatLatencyMs(latency.max)}`;
  }
  return undefined;
}

/**
 * Shared display labels for the per-test latency / cost / token aggregates,
 * reused by the test Summary cards and the benchmark leaderboard so the two
 * always read identically (and avoid the cramped "Avg" abbreviation).
 */
export const METRIC_LABELS = {
  latency: "Average latency",
  cost: "Average cost",
  tokens: "Average tokens",
} as const;

/**
 * Format an average latency in milliseconds. Sub-second values render as
 * whole milliseconds (`850 ms`); anything ≥ 1s renders as seconds with two
 * decimals (`1.23 s`). Returns an em dash for missing / non-finite input so
 * callers can render it directly.
 */
export function formatLatencyMs(ms: number | null | undefined): string {
  if (ms == null) return "—";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "—";
  // parseFloat drops trailing zeros so whole values show no decimals (2 s, not 2.00 s).
  if (n >= 1000) return `${parseFloat((n / 1000).toFixed(2))} s`;
  return `${Math.round(n)} ms`;
}

/**
 * Format a cost in USD. Per-test costs are tiny, so precision scales with
 * magnitude: ≥ $1 → 2 decimals, ≥ $0.01 → 4 decimals, otherwise 6 decimals.
 * Returns an em dash for missing / non-finite input.
 */
export function formatCostUsd(usd: number | null | undefined): string {
  if (usd == null) return "—";
  const n = Number(usd);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "$0";
  const decimals = n >= 1 ? 2 : n >= 0.01 ? 4 : 6;
  // parseFloat drops trailing zeros so whole values show no decimals ($2, not $2.00).
  return `$${parseFloat(n.toFixed(decimals))}`;
}

/**
 * Format a token count as a rounded integer with thousands separators
 * (1,234). Returns an em dash for missing / non-finite input.
 */
export function formatTokens(tokens: number | null | undefined): string {
  if (tokens == null) return "—";
  const n = Number(tokens);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("en-US");
}

/**
 * Format a percentage (0–100) with up to `decimals` places, dropping trailing
 * zeros so whole values show no decimals (100%, not 100.0%). Returns an em
 * dash for missing / non-finite input.
 */
export function formatPercent(
  value: number | null | undefined,
  decimals = 1,
): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${parseFloat(n.toFixed(decimals))}%`;
}

/**
 * Format a rating/score with up to `decimals` places, dropping trailing zeros
 * (4, not 4.00). Returns an em dash for missing / non-finite input.
 */
export function formatRating(
  value: number | null | undefined,
  decimals = 2,
): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return `${parseFloat(n.toFixed(decimals))}`;
}
