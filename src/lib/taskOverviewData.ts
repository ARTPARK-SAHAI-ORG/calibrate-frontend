/**
 * Does the task overview have anything to show, or only the placeholder?
 *
 * Three separate things can fill the overview, and any one of them is
 * enough: annotators agreeing with each other, an evaluator lining up with
 * the annotators, or an evaluator score with no human labels behind it yet.
 * A finished evaluation run counts as well, because the agreement figures
 * only cover the evaluator's live version and a run on an older version
 * still has scores the user can open.
 */
export function hasTaskOverviewData(
  agreement: {
    human_human?: { pair_count?: number } | null;
    evaluators?: {
      pair_count?: number;
      result?: { count?: number } | null;
    }[];
  } | null,
  runs: { status?: string }[],
): boolean {
  if (!agreement) return false;
  if ((agreement.human_human?.pair_count ?? 0) > 0) return true;
  const evaluators = agreement.evaluators ?? [];
  if (
    evaluators.some((e) => (e.pair_count ?? 0) > 0 || (e.result?.count ?? 0) > 0)
  )
    return true;
  // A finished run counts only while its evaluator is still on the task. Once
  // it is removed the task has no evaluators left to draw cards for, however
  // many runs the task once had.
  return evaluators.length > 0 && runs.some((r) => r.status === "completed");
}
