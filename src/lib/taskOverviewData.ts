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
  if (
    (agreement.evaluators ?? []).some(
      (e) => (e.pair_count ?? 0) > 0 || (e.result?.count ?? 0) > 0,
    )
  )
    return true;
  return runs.some((r) => r.status === "completed");
}
