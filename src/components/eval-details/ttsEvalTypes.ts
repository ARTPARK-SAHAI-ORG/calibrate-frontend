/**
 * Shared response shapes for the TTS evaluation pages (authenticated
 * `/tts/[uuid]` and the public `/public/tts/[token]` share page). Kept in one
 * place so the two pages can't drift apart.
 */

/**
 * A latency metric block on a TTS provider's `metrics` (e.g. `ttfb`,
 * `processing_time`). The backend now reports latency as percentiles, so `p50`
 * is the headline value; `mean` / `std` / `values` are the legacy shape kept
 * for runs generated before the switch. Read `p50 ?? mean`.
 */
// Any percentile may be `null` when a provider didn't produce the latency
// (e.g. Gemini STT reports no TTFS) — readers treat null like a missing value.
export type LatencyMetric = {
  p50?: number | null;
  p95?: number | null;
  p99?: number | null;
  count?: number | null;
  mean?: number | null;
  std?: number | null;
  values?: number[] | null;
};

/**
 * One row of the TTS leaderboard. TTFB is now reported as percentiles
 * (`ttfb_p50` / `ttfb_p95` / `ttfb_p99`); `ttfb` is the legacy mean column kept
 * for runs from before the switch. Dynamic per-evaluator columns arrive via the
 * index signature.
 */
export type TTSLeaderboardSummary = {
  run: string;
  count: number;
  llm_judge_score?: number;
  ttfb_p50?: number;
  ttfb_p95?: number;
  ttfb_p99?: number;
  ttfb?: number;
  processing_time?: number;
  // Per-minute USD cost, flattened onto the leaderboard row when the run
  // computed cost.
  cost_per_minute_usd?: number;
  [k: string]: string | number | undefined;
};
