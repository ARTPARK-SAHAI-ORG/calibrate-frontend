/**
 * Weighted model ranking for the benchmark "Model selection" tab. Turns the
 * three per-model metrics — quality (pass rate), cost, and latency — into a
 * single 0–100 score using user-set weights, so the leaderboard can be
 * re-ordered by "what matters to me" as the weight sliders move.
 *
 * Pure functions only (no React) so the scoring is unit-tested directly. The
 * component reads its rows from `buildBenchmarkCombinedLeaderboardPayload`, so
 * the input here is that builder's per-model rows.
 */

export type RankingDimension = "quality" | "cost" | "latency";

/** Weights per dimension as integer percentages that add up to 100. */
export type RankingWeights = Partial<Record<RankingDimension, number>>;

/** Row key each dimension reads off a builder row, and whether lower is better. */
const DIMENSION_FIELD: Record<RankingDimension, string> = {
  quality: "pass_rate",
  cost: "avg_cost",
  latency: "avg_latency_ms",
};

/** Cost and latency are "lower is better" — invert them before scoring. */
const LOWER_IS_BETTER: Record<RankingDimension, boolean> = {
  quality: false,
  cost: true,
  latency: true,
};

const DEFAULT_TEMPLATE: Record<RankingDimension, number> = {
  quality: 0.5,
  cost: 0.3,
  latency: 0.2,
};

export type RankedModel = {
  model: string;
  score: number;
  quality?: number;
  cost?: number;
  latency?: number;
  rank: number;
};

/**
 * A display-ready input row for the ranking widget. The scorer reads
 * `pass_rate` / `avg_cost` / `avg_latency_ms` (same field names for LLM and
 * audio); `name` is the label shown in the list and `qualityText` is the
 * already-formatted quality chunk of the subtitle (e.g. "72% pass" for LLM,
 * "WER 0.05" for STT) so each surface shows quality the way its chart does.
 */
export type WeightedRankingRow = {
  model: string;
  name: string;
  qualityText: string;
  pass_rate?: number;
  avg_cost?: number;
  avg_latency_ms?: number;
};

/**
 * Active dimensions for a set of rows: a dimension is offered only when at
 * least one row reports its metric. Mirrors the LLM payload's `show*` flags so
 * a metric absent across the whole run never shows a dead slider.
 */
export function dimsFromRows(rows: WeightedRankingRow[]): RankingDimension[] {
  const dims: RankingDimension[] = [];
  if (rows.some((r) => toFinite(r.pass_rate) !== undefined)) dims.push("quality");
  if (rows.some((r) => toFinite(r.avg_cost) !== undefined)) dims.push("cost");
  if (rows.some((r) => toFinite(r.avg_latency_ms) !== undefined))
    dims.push("latency");
  return dims;
}

/** Coerce to a finite number, or undefined when the value isn't one. */
export function toFinite(value: unknown): number | undefined {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Spread a set of relative emphases over the active dimensions so the result is
 * integer percentages summing to exactly 100. Used for the default weights and
 * for the preset buttons — both just supply a template. Dimensions not in
 * `dims` are dropped and the rest are renormalized, so a missing metric never
 * leaves weight stranded on a slider that is not shown.
 */
export function weightsFromTemplate(
  template: Record<RankingDimension, number>,
  dims: RankingDimension[],
): RankingWeights {
  if (dims.length === 0) return {};
  const sum = dims.reduce((acc, d) => acc + (template[d] || 0), 0);
  const weights: RankingWeights = {};
  if (sum <= 0) {
    // Template has nothing to say about these dims — split evenly.
    dims.forEach((d) => (weights[d] = Math.round(100 / dims.length)));
  } else {
    dims.forEach((d) => (weights[d] = Math.round(((template[d] || 0) / sum) * 100)));
  }
  const drift = 100 - dims.reduce((acc, d) => acc + (weights[d] || 0), 0);
  weights[dims[0]] = (weights[dims[0]] || 0) + drift;
  return weights;
}

/** Default weights over the active dimensions: quality-heavy, then cost, then latency. */
export function defaultWeights(dims: RankingDimension[]): RankingWeights {
  return weightsFromTemplate(DEFAULT_TEMPLATE, dims);
}

/**
 * After one slider moves to a new value, rescale the other active dimensions
 * proportionally so all weights still add up to 100. If the others were both
 * at zero, split the remainder evenly. Rounding drift is absorbed by the first
 * other dimension so the sum is always exactly 100.
 */
export function rebalanceWeights(
  weights: RankingWeights,
  moved: RankingDimension,
  dims: RankingDimension[],
): RankingWeights {
  const next: RankingWeights = {};
  dims.forEach((d) => (next[d] = Math.max(0, Math.min(100, weights[d] || 0))));
  const others = dims.filter((d) => d !== moved);
  if (others.length === 0) {
    next[moved] = 100;
    return next;
  }
  const rest = 100 - (next[moved] || 0);
  const sumOthers = others.reduce((acc, d) => acc + (next[d] || 0), 0);
  if (sumOthers === 0) {
    others.forEach((d) => (next[d] = rest / others.length));
  } else {
    others.forEach((d) => (next[d] = (rest * (next[d] || 0)) / sumOthers));
  }
  others.forEach((d) => (next[d] = Math.round(next[d] || 0)));
  const drift = 100 - dims.reduce((acc, d) => acc + (next[d] || 0), 0);
  next[others[0]] = (next[others[0]] || 0) + drift;
  return next;
}

/**
 * Score and rank the models. Each active dimension is min-max normalized across
 * the models that report it (cost and latency inverted), then combined into a
 * weighted average scaled to 0–100. A model missing a metric is scored over
 * only the dimensions it has (its weights renormalize), so it is neither
 * rewarded nor buried for the gap. Ties keep the input order.
 */
export function rankModelsByWeights(
  rows: Record<string, unknown>[],
  weights: RankingWeights,
  dims: RankingDimension[],
): RankedModel[] {
  const models = rows.map((row) => ({
    model: String(row.model),
    quality: toFinite(row[DIMENSION_FIELD.quality]),
    cost: toFinite(row[DIMENSION_FIELD.cost]),
    latency: toFinite(row[DIMENSION_FIELD.latency]),
  }));

  const ranges = new Map<RankingDimension, { min: number; max: number }>();
  for (const d of dims) {
    const vals = models
      .map((m) => m[d])
      .filter((v): v is number => v !== undefined);
    if (vals.length > 0) {
      ranges.set(d, { min: Math.min(...vals), max: Math.max(...vals) });
    }
  }

  const scored = models.map((m, idx) => {
    let weightSum = 0;
    let acc = 0;
    for (const d of dims) {
      const value = m[d];
      const range = ranges.get(d);
      const w = weights[d] || 0;
      if (value === undefined || !range || w <= 0) continue;
      // A constant column can't rank anyone, so give every model the same full
      // credit regardless of direction — inverting here would zero out a
      // constant cost/latency column and wrongly deflate the score.
      let norm: number;
      if (range.max === range.min) {
        norm = 1;
      } else {
        const t = (value - range.min) / (range.max - range.min);
        norm = LOWER_IS_BETTER[d] ? 1 - t : t;
      }
      acc += w * norm;
      weightSum += w;
    }
    const score = weightSum > 0 ? (acc / weightSum) * 100 : 0;
    return { ...m, score, idx };
  });

  scored.sort((a, b) => b.score - a.score || a.idx - b.idx);

  return scored.map((m, i) => ({
    model: m.model,
    score: m.score,
    quality: m.quality,
    cost: m.cost,
    latency: m.latency,
    rank: i + 1,
  }));
}
