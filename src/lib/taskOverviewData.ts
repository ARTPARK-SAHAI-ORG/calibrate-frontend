import type { EvaluatorResultStat } from "@/components/human-labelling/AgreementStatCard";

/**
 * Does the task overview have anything to show, or only the placeholder?
 *
 * Four separate things can fill the overview, and any one of them is
 * enough: annotators agreeing with each other, an evaluator lining up with
 * the annotators, an evaluator score with no human labels behind it yet, or
 * the scores annotators gave with no evaluator run behind them yet.
 * A finished evaluation run counts as well, because the agreement figures
 * only cover the evaluator's live version and a run on an older version
 * still has scores the user can open.
 *
 * A card that stays on screen with nothing in it counts too. Tool call
 * correctness keeps one, so a task made only of tool call items has an
 * overview to show from the day it is created.
 */
export function hasTaskOverviewData(
  agreement: {
    human_human?: { pair_count?: number } | null;
    evaluators?: {
      pair_count?: number;
      result?: { count?: number } | null;
      human_result?: { count?: number } | null;
    }[];
  } | null,
  runs: { status?: string }[],
  /** Whether `taskEvaluatorScoreCards` produced a card. */
  hasScoreCard = false,
): boolean {
  if (!agreement) return false;
  if (hasScoreCard) return true;
  if ((agreement.human_human?.pair_count ?? 0) > 0) return true;
  const evaluators = agreement.evaluators ?? [];
  if (
    evaluators.some(
      (e) =>
        (e.pair_count ?? 0) > 0 ||
        (e.result?.count ?? 0) > 0 ||
        (e.human_result?.count ?? 0) > 0,
    )
  )
    return true;
  // A finished run counts only while its evaluator is still on the task. Once
  // it is removed the task has no evaluators left to draw cards for, however
  // many runs the task once had.
  return evaluators.length > 0 && runs.some((r) => r.status === "completed");
}

/**
 * The cards under "Evaluator scores" on the task overview.
 *
 * An evaluator with no score to show normally has no card: it has never run,
 * and an empty card would read as a failure rather than an absence. Tool call
 * correctness is the exception. It is always on the task the reader is
 * looking at, so its card stays on screen and shows nothing until the tool
 * call results are carried across.
 */
export function taskEvaluatorScoreCards<
  T extends { evaluator_id: string; name: string },
>(
  evaluators: readonly T[],
  stats: Record<string, EvaluatorResultStat | null>,
  toolCallEvaluatorIds: ReadonlySet<string>,
): { evaluatorId: string; name: string; stat: EvaluatorResultStat | null }[] {
  return evaluators
    .filter(
      (ev) =>
        stats[ev.evaluator_id] != null ||
        toolCallEvaluatorIds.has(ev.evaluator_id),
    )
    .map((ev) => ({
      evaluatorId: ev.evaluator_id,
      name: ev.name,
      stat: stats[ev.evaluator_id] ?? null,
    }));
}
