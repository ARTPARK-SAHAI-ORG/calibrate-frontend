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
