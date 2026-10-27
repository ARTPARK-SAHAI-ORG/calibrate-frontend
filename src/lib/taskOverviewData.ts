import type { EvaluatorResultStat } from "@/components/human-labelling/AgreementStatCard";
import {
  compareCells,
  type SortDirection,
} from "@/components/eval-details/tableSort";
import {
  answerKindOf,
  type AnswerKind,
  type KappaFields,
} from "@/lib/agreementKappa";

type GroupLike = { current?: number | null; pair_count?: number } | null | undefined;

/**
 * Has anything been compared yet: annotators with each other, evaluators
 * with humans overall, or any one evaluator either way? Every agreement
 * screen shows its empty state when this is false.
 */
export function hasAgreementData(
  agreement:
    | {
        human_human?: GroupLike;
        evaluators_with_humans?: GroupLike;
        evaluators?: readonly (NonNullable<GroupLike> & {
          inter_annotator?: GroupLike;
        })[];
      }
    | null
    | undefined,
): boolean {
  const has = (g: GroupLike) => g?.current != null || (g?.pair_count ?? 0) > 0;
  if (!agreement) return false;
  return (
    has(agreement.human_human) ||
    has(agreement.evaluators_with_humans) ||
    (agreement.evaluators ?? []).some((e) => has(e) || has(e.inter_annotator))
  );
}

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
  if (hasScoreCard || hasAgreementData(agreement)) return true;
  const evaluators = agreement.evaluators ?? [];
  if (
    evaluators.some(
      (e) => (e.result?.count ?? 0) > 0 || (e.human_result?.count ?? 0) > 0,
    )
  )
    return true;
  // A finished run counts only while its evaluator is still on the task. Once
  // it is removed the task has no evaluators left to draw cards for, however
  // many runs the task once had.
  return evaluators.length > 0 && runs.some((r) => r.status === "completed");
}

/**
 * Does the "Score reliability" row have a single number in it?
 *
 * When none of them has one, the whole row goes: the note above it already
 * says why the numbers are missing, and a line of dashes reads as a failure
 * rather than an absence. The cards themselves stay as they are, dash and
 * all, as soon as one number is there, because a dash beside a real number
 * says which evaluator the note is about.
 */
export function hasReliabilityNumber(
  humanHuman: { current?: number | null } | null | undefined,
  evaluators: readonly { current?: number | null }[],
): boolean {
  return (
    humanHuman?.current != null || evaluators.some((ev) => ev.current != null)
  );
}

/**
 * The cards under "Evaluator scores" on the task overview.
 *
 * An evaluator with no score to show has no card: it has never run, and an
 * empty card would read as a failure rather than an absence.
 */
export function taskEvaluatorScoreCards<
  T extends { evaluator_id: string; name: string },
>(
  evaluators: readonly T[],
  stats: Record<string, EvaluatorResultStat | null>,
): { evaluatorId: string; name: string; stat: EvaluatorResultStat }[] {
  return evaluators
    .filter((ev) => stats[ev.evaluator_id] != null)
    .map((ev) => ({
      evaluatorId: ev.evaluator_id,
      name: ev.name,
      stat: stats[ev.evaluator_id]!,
    }));
}

type OverviewGroup = { current: number | null; kappa?: number | null };

/**
 * The evaluator rows on the Human alignment overview. Across all tasks, an
 * evaluator with no agreement and no kappa in either group, inter-annotator
 * or with humans, has nothing to show and is left out. One task keeps every
 * evaluator linked to it.
 */
export function overviewRows<
  T extends { withHumans: OverviewGroup; interAnnotator: OverviewGroup },
>(rows: T[], allTasks: boolean): T[] {
  if (!allTasks) return rows;
  const has = (g: OverviewGroup) => g.current != null || g.kappa != null;
  return rows.filter((r) => has(r.withHumans) || has(r.interAnnotator));
}

export type AgreementGroup = KappaFields & {
  current: number | null;
  pair_count: number;
};

export type EvaluatorAgreement = AgreementGroup & {
  evaluator_id: string;
  name: string;
  /** How well annotators agree with each other on this evaluator's items. */
  inter_annotator?: AgreementGroup | null;
};

type ResultCounts = {
  count: number;
  true_count?: number | null;
  mean?: number | null;
} | null;

/** What a task's or the workspace's agreement request returns. */
export type TaskAgreementResponse = {
  task_id?: string;
  /** Overall agreement between annotators. */
  human_human: { current: number | null; pair_count: number };
  /** Overall agreement between evaluators and humans. */
  evaluators_with_humans?: { current: number | null; pair_count: number } | null;
  evaluators: (EvaluatorAgreement & {
    /** The evaluator's own rolled-up output across every item in the task,
     * independent of any human labels. `count` is the number of items it
     * produced a value for; a binary evaluator fills `true_count`, a rating
     * evaluator fills `mean`. Absent when it has not run on anything. */
    result?: ResultCounts;
    /** The same rolled-up numbers, taken from the labels annotators gave on
     * this evaluator instead of from the evaluator's own output. Absent when
     * nobody has labelled for it yet. */
    human_result?: ResultCounts;
  })[];
};

export type OverviewSortKey = "name" | "interAnnotator" | "withHumans";

export type OverviewRow = {
  key: string;
  name: string;
  kind: AnswerKind | null;
  withHumans: AgreementGroup;
  interAnnotator: AgreementGroup;
};

const EMPTY_GROUP: AgreementGroup = { current: null, pair_count: 0 };

/** One row per evaluator, with its kind of answer and both measures. */
export function buildOverviewRows(
  evaluators: readonly EvaluatorAgreement[],
): OverviewRow[] {
  return evaluators.map((ev) => ({
    key: ev.evaluator_id,
    name: ev.name,
    kind: answerKindOf(ev.kappa_type ?? ev.inter_annotator?.kappa_type),
    withHumans: ev,
    interAnnotator: ev.inter_annotator ?? EMPTY_GROUP,
  }));
}

/**
 * The overview rows in the reader's chosen order. Evaluators of the same type
 * sit together, typed groups first. Within a group, a row with no agreement
 * goes last whichever way the column is sorted, since a missing number is
 * neither high nor low.
 */
export function sortOverviewRows<
  T extends OverviewRow & { evaluatorType?: string },
>(rows: readonly T[], sortKey: OverviewSortKey, sortDir: SortDirection): T[] {
  return [...rows].sort((a, b) => {
    const aType = a.evaluatorType ?? "";
    const bType = b.evaluatorType ?? "";
    if (aType !== bType) {
      if (!aType) return 1;
      if (!bType) return -1;
      return aType.localeCompare(bType);
    }
    return sortKey === "name"
      ? compareCells(a.name, b.name, sortDir)
      : compareCells(a[sortKey].current, b[sortKey].current, sortDir);
  });
}
