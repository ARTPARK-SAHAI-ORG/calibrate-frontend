/**
 * Pareto-frontier helper for the benchmark leaderboard scatter chart.
 *
 * Models are compared on three objectives: **cost** (lower is better), **pass
 * rate** (higher is better) and **latency** (lower is better). A model A
 * *dominates* model B when A is no worse than B on every objective and strictly
 * better on at least one — i.e. A is at least as cheap, at least as accurate AND
 * at least as fast as B, while beating it on price, score or speed. The Pareto
 * frontier is the set of models that no other model dominates: the "efficient"
 * choices where any improvement on one axis costs you on another.
 *
 * Latency is optional. When either model in a pairwise comparison is missing a
 * finite latency, the latency axis is dropped for that pair and dominance falls
 * back to cost vs pass rate — so a run with no latency data behaves exactly like
 * the two-objective frontier.
 */

export type ParetoPoint = {
  /** Stable model identifier (matches the leaderboard row `model`). */
  model: string;
  /** Cost objective — lower is better (USD). */
  cost: number;
  /** Pass-rate objective — higher is better (0–100). */
  passRate: number;
  /** Latency objective — lower is better (ms). Optional. */
  latency?: number;
};

/** True when `a` dominates `b`: no worse on every objective, strictly better on one. */
function dominates(a: ParetoPoint, b: ParetoPoint): boolean {
  const bothLatency =
    Number.isFinite(a.latency) && Number.isFinite(b.latency);

  const noWorse =
    a.cost <= b.cost &&
    a.passRate >= b.passRate &&
    (!bothLatency || (a.latency as number) <= (b.latency as number));

  const strictlyBetter =
    a.cost < b.cost ||
    a.passRate > b.passRate ||
    (bothLatency && (a.latency as number) < (b.latency as number));

  return noWorse && strictlyBetter;
}

/**
 * Return the set of model ids that lie on the Pareto frontier across cost, pass
 * rate and latency. Points with a non-finite cost or pass rate are ignored
 * (latency may be absent). Ties — models dominated by no one — are all kept.
 */
export function computeParetoFrontier(points: ParetoPoint[]): Set<string> {
  const valid = points.filter(
    (p) => Number.isFinite(p.cost) && Number.isFinite(p.passRate),
  );
  const frontier = new Set<string>();
  for (const p of valid) {
    const isDominated = valid.some((other) => dominates(other, p));
    if (!isDominated) frontier.add(p.model);
  }
  return frontier;
}

/**
 * Order the frontier's model ids by ascending cost (then descending pass rate
 * for equal cost) so a connecting line can be drawn through them left-to-right.
 */
export function orderFrontierByCost(
  points: ParetoPoint[],
  frontier: Set<string>,
): ParetoPoint[] {
  return points
    .filter((p) => frontier.has(p.model))
    .sort((a, b) => a.cost - b.cost || b.passRate - a.passRate);
}
