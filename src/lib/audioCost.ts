/**
 * Cost helpers for STT / TTS evaluation runs.
 *
 * Each provider's `metrics` carries a nested `cost` block. The shape varies by
 * how the provider bills and prices:
 *   - `billing_unit`: "minute" (audio) or "character" (text).
 *   - `currency`: the provider's native pricing currency ("USD" or "INR").
 * The per-unit price is always in the native currency
 * (`cost_per_minute_currency` / `cost_per_million_chars_currency`), while
 * `cost_usd` is the total run cost converted to USD — the one figure that is
 * comparable across providers regardless of unit or currency. For non-USD
 * providers the block also carries `cost_in_currency` (native total) and
 * `conversion_rate` (native units per USD) used for that conversion.
 */

export type AudioCostBreakdown = {
  provider?: string;
  pricing_model?: string;
  /** "minute" (audio-billed) or "character" (text-billed). */
  billing_unit?: string;
  total_seconds?: number;
  audio_minutes?: number;
  total_characters?: number;
  /** Native pricing currency, e.g. "USD" or "INR". */
  currency?: string;
  /** Native price per audio minute (minute-billed providers). */
  cost_per_minute_currency?: number;
  /** Native price per 1M characters (character-billed providers). */
  cost_per_million_chars_currency?: number;
  /** Total cost in the native currency (present when currency !== USD). */
  cost_in_currency?: number;
  /** Native units per USD used to convert (present when currency !== USD). */
  conversion_rate?: number;
  /** Total run cost in USD — comparable across providers. Always present. */
  cost_usd?: number;
  /** Rows whose audio couldn't be read and so were excluded from the cost. */
  excluded_row_indices?: number[];
};

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", INR: "₹" };

function coerceNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * Pull the cost breakdown out of a metrics-like object. Provider metrics nest
 * it under `cost`; a leaderboard row may carry the cost fields flattened. Falls
 * back to `null` when there's no cost.
 */
export function readCost(source: unknown): AudioCostBreakdown | null {
  if (!source || typeof source !== "object") return null;
  const obj = source as Record<string, unknown>;
  const nested = obj.cost;
  if (nested && typeof nested === "object") return nested as AudioCostBreakdown;
  if (
    "cost_usd" in obj ||
    "cost_per_minute_currency" in obj ||
    "cost_per_million_chars_currency" in obj
  ) {
    return obj as AudioCostBreakdown;
  }
  return null;
}

/**
 * Total run cost in USD — the cross-provider-comparable figure (used by the
 * Pareto frontier's cost axis and the "Total cost" metric tile). Null when the
 * run computed no cost.
 */
export function readTotalCostUsd(source: unknown): number | null {
  const cost = readCost(source);
  return cost ? coerceNumber(cost.cost_usd) : null;
}

/** Format a money amount with its currency symbol; precision scales with magnitude. */
export function formatMoney(
  value: number | null | undefined,
  currency = "USD",
): string {
  if (value == null) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const symbol = CURRENCY_SYMBOLS[currency.toUpperCase()] ?? `${currency} `;
  if (n === 0) return `${symbol}0`;
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  // parseFloat drops trailing zeros so whole values show no decimals.
  return `${symbol}${parseFloat(n.toFixed(decimals))}`;
}

export type CostTile = { label: string; value: string };

/** "Total cost" tile in USD. Null when no USD total was computed. */
export function totalCostTile(cost: AudioCostBreakdown): CostTile | null {
  const usd = coerceNumber(cost.cost_usd);
  if (usd == null) return null;
  return { label: "Total cost", value: formatMoney(usd, "USD") };
}

/** Per-unit price tile in the provider's native currency (per minute / 1M chars). */
export function unitCostTile(cost: AudioCostBreakdown): CostTile | null {
  const currency = cost.currency ?? "USD";
  if (cost.billing_unit === "character") {
    const v = coerceNumber(cost.cost_per_million_chars_currency);
    if (v == null) return null;
    return { label: "Cost per 1M characters", value: formatMoney(v, currency) };
  }
  const v = coerceNumber(cost.cost_per_minute_currency);
  if (v == null) return null;
  return { label: "Cost per minute", value: formatMoney(v, currency) };
}

/**
 * The cost tiles for a provider's Overall Metrics card: total USD cost plus the
 * native per-unit price. Empty when the run computed no cost.
 */
export function costTiles(source: unknown): CostTile[] {
  const cost = readCost(source);
  if (!cost) return [];
  const tiles: CostTile[] = [];
  const total = totalCostTile(cost);
  if (total) tiles.push(total);
  const unit = unitCostTile(cost);
  if (unit) tiles.push(unit);
  return tiles;
}

/** Date-only format for the caveat (e.g. "15 Jul 2026"). Null on bad/empty input. */
export function formatCaveatDate(dateString?: string | null): string | null {
  if (!dateString) return null;
  const d = new Date(dateString.replace(" ", "T"));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export type CostCaveatContext = {
  /** Which evaluation this cost is for — decides the audio-billed TTS caveat. */
  component: "stt" | "tts";
  /** Run date (created_at) — dates the FX conversion for non-USD providers. */
  runDate?: string | null;
};

/** Applies to every estimated cost — rates are bundled, tier/variant-limited. */
export const GENERAL_COST_CAVEAT =
  "Cost is an estimate from bundled provider rates (captured mid-2026) at each provider's standard pay-as-you-go tier and a single model variant. Per-request minimums, rounding, taxes, and volume or committed-use discounts are not modeled, so many short requests read low.";

/** Applies to minute-billed TTS (audio-token models estimated from audio length). */
export const TTS_AUDIO_BILLED_CAVEAT =
  "Audio-billed models (e.g. OpenAI, Gemini) are approximated as measured audio length × per-minute rate, so the same text can cost differently across providers.";

/**
 * The caveats to surface wherever this provider's cost is shown. Always includes
 * the general estimate caveat; adds the audio-billed-TTS note for minute-billed
 * TTS and the FX-conversion note (rate + run date) for non-USD providers. Empty
 * when the run computed no cost.
 */
export function costCaveats(source: unknown, ctx: CostCaveatContext): string[] {
  const cost = readCost(source);
  if (!cost) return [];
  const lines: string[] = [GENERAL_COST_CAVEAT];
  if (ctx.component === "tts" && cost.billing_unit === "minute") {
    lines.push(TTS_AUDIO_BILLED_CAVEAT);
  }
  const currency = (cost.currency ?? "USD").toUpperCase();
  if (currency !== "USD") {
    const rate = coerceNumber(cost.conversion_rate);
    const symbol = CURRENCY_SYMBOLS[currency] ?? currency;
    const ratePart =
      rate != null
        ? `${symbol}${parseFloat(rate.toFixed(2))} = $1`
        : `${currency} to USD`;
    const date = formatCaveatDate(ctx.runDate);
    const asOf = date ? ` as of ${date}` : "";
    lines.push(
      `Total cost converted from ${currency} at a live mid-market rate (${ratePart}${asOf}); a real payment also incurs FX margin and GST.`,
    );
  }
  return lines;
}
