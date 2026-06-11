/**
 * Display formatters for the latency / cost numbers the backend now returns
 * for LLM test-runs and benchmarks. Shared by the single-model test summary
 * and the benchmark leaderboard so the two always format the same way.
 */

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
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
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
  return `$${n.toFixed(decimals)}`;
}
