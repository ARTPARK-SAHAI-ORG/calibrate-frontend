/**
 * Pareto-frontier helper for the benchmark leaderboard scatter chart.
 *
 * Models are compared on two objectives: **cost** (lower is better) and
 * **accuracy** (higher is better). A model A *dominates* model B when A is no
 * worse on both objectives and strictly better on at least one — i.e. A is at
 * least as cheap AND at least as accurate as B, and beats it on price or score.
 * The Pareto frontier is the set of models that no other model dominates: the
 * "efficient" choices where you can't get cheaper without losing accuracy (or
 * more accurate without paying more). Latency is intentionally NOT part of the
 * dominance test — it's carried through only for the bubble-size dimension.
 */

export type ParetoPoint = {
  /** Stable model identifier (matches the leaderboard row `model`). */
  model: string;
  /** Cost objective — lower is better (USD). */
  cost: number;
  /** Accuracy objective — higher is better (0–100 pass rate). */
  accuracy: number;
};

/** True when `a` dominates `b` (no worse on both axes, strictly better on one). */
function dominates(a: ParetoPoint, b: ParetoPoint): boolean {
  const noWorse = a.cost <= b.cost && a.accuracy >= b.accuracy;
  const strictlyBetter = a.cost < b.cost || a.accuracy > b.accuracy;
  return noWorse && strictlyBetter;
}

/**
 * Return the set of model ids that lie on the Pareto frontier (cost vs
 * accuracy). Points with a non-finite cost or accuracy are ignored. Ties —
 * models with identical cost and accuracy — are all kept, since neither
 * strictly dominates the other.
 */
export function computeParetoFrontier(points: ParetoPoint[]): Set<string> {
  const valid = points.filter(
    (p) => Number.isFinite(p.cost) && Number.isFinite(p.accuracy),
  );
  const frontier = new Set<string>();
  for (const p of valid) {
    const isDominated = valid.some((other) => dominates(other, p));
    if (!isDominated) frontier.add(p.model);
  }
  return frontier;
}

/**
 * Order the frontier's model ids by ascending cost (then descending accuracy
 * for equal cost) so a connecting line can be drawn through them left-to-right.
 */
export function orderFrontierByCost(
  points: ParetoPoint[],
  frontier: Set<string>,
): ParetoPoint[] {
  return points
    .filter((p) => frontier.has(p.model))
    .sort((a, b) => a.cost - b.cost || b.accuracy - a.accuracy);
}
