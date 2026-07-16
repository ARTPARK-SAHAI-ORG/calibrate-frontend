/**
 * Cost helpers for STT / TTS evaluation runs.
 *
 * Each provider's `metrics` now carries a nested `cost` block computed from the
 * provider's per-minute pricing and the evaluated audio duration. The headline
 * figure we surface is `cost_per_minute_usd` (USD per minute of audio), which is
 * comparable across providers regardless of dataset size. Aggregated leaderboard
 * rows may instead carry a flattened `cost_per_minute_usd`, so readers tolerate
 * both shapes.
 */

export type AudioCostBreakdown = {
  provider?: string;
  pricing_model?: string;
  currency?: string;
  billing_unit?: string;
  total_seconds?: number;
  audio_minutes?: number;
  cost_per_minute_usd?: number;
  cost_usd?: number;
};

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Read the per-minute USD cost from an STT/TTS metrics-like object. Provider
 * metrics nest it under `cost` (`cost.cost_per_minute_usd`); aggregated
 * leaderboard rows may flatten it to `cost_per_minute_usd`. Tolerate both, plus
 * string-encoded numbers. Returns `null` when no cost was computed.
 */
export function readCostPerMinuteUsd(source: unknown): number | null {
  if (!source || typeof source !== "object") return null;
  const obj = source as Record<string, unknown>;
  const flat = coerceNumber(obj.cost_per_minute_usd);
  if (flat != null) return flat;
  const cost = obj.cost;
  if (cost && typeof cost === "object") {
    return coerceNumber((cost as Record<string, unknown>).cost_per_minute_usd);
  }
  return null;
}

/**
 * Map each provider (leaderboard `run`) to its per-minute USD cost, keeping only
 * providers that computed one. Used to join provider-level cost onto leaderboard
 * rows that don't carry it directly.
 */
export function costByRunFromProviders(
  providerResults:
    | Array<{ provider: string; metrics?: Record<string, unknown> | null }>
    | null
    | undefined,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const pr of providerResults ?? []) {
    const cpm = readCostPerMinuteUsd(pr.metrics);
    if (cpm != null) out[pr.provider] = cpm;
  }
  return out;
}

/** Column/tile/chart label for the per-minute cost metric. */
export const COST_PER_MINUTE_LABEL = "Cost (USD/min)";
/** Flat leaderboard-row key the cost column / chart read from. */
export const COST_PER_MINUTE_KEY = "cost_per_minute_usd";
