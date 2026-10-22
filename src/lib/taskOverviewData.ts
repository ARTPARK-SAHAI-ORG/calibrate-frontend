import type { EvaluatorResultStat } from "@/components/human-labelling/AgreementStatCard";
import {
  answerKindOf,
  type AnswerKind,
  type KappaFields,
  type TrendSeries,
} from "@/lib/agreementKappa";

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

export type AgreementSeriesPoint = KappaFields & {
  bucket_start: string;
  bucket_end: string;
  agreement: number | null;
  pair_count: number;
};

export type AgreementGroup = KappaFields & {
  current: number | null;
  pair_count: number;
  series: AgreementSeriesPoint[];
};

export type EvaluatorAgreement = AgreementGroup & {
  evaluator_id: string;
  name: string;
  /** How well annotators agree with each other on this evaluator's items. */
  inter_annotator?: AgreementGroup | null;
};

export type OverviewRow = {
  key: string;
  name: string;
  color: string;
  kind: AnswerKind | null;
  withHumans: AgreementGroup;
  interAnnotator: AgreementGroup;
};

const EMPTY_GROUP: AgreementGroup = { current: null, pair_count: 0, series: [] };

/** One row per evaluator, each in its own chart colour. */
export function buildOverviewRows(
  evaluators: readonly EvaluatorAgreement[],
): OverviewRow[] {
  return evaluators.map((ev, i) => ({
    key: ev.evaluator_id,
    name: ev.name,
    color: `var(--chart-${(i % 8) + 1})`,
    kind: answerKindOf(ev.kappa_type ?? ev.inter_annotator?.kappa_type),
    withHumans: ev,
    interAnnotator: ev.inter_annotator ?? EMPTY_GROUP,
  }));
}

/**
 * The overview chart: the two overall numbers as thick lines, then for each
 * evaluator its inter-annotator agreement, dashed, and its agreement with
 * humans, solid, both in the evaluator's colour.
 */
export function overviewChartSeries(
  overall: {
    human_human?: AgreementGroup | null;
    evaluators_with_humans?: AgreementGroup | null;
  },
  rows: readonly OverviewRow[],
  label: (bucketEnd: string) => string,
): TrendSeries[] {
  const points = (group: AgreementGroup | null | undefined) =>
    (group?.series ?? []).map((p) => ({
      ...p,
      key: p.bucket_end,
      label: label(p.bucket_end),
    }));
  const line = (
    key: string,
    name: string,
    color: string,
    group: AgreementGroup | null | undefined,
    style: { dashed?: boolean; overall?: boolean },
  ): TrendSeries => ({
    key,
    name,
    kappaName: name,
    color,
    points: points(group),
    ...style,
  });
  return [
    line(
      "overall_inter_annotator",
      "Overall inter-annotator agreement",
      "var(--foreground)",
      overall.human_human,
      { dashed: true, overall: true },
    ),
    line(
      "overall_with_humans",
      "Overall evaluator agreement with humans",
      "var(--foreground)",
      overall.evaluators_with_humans,
      { overall: true },
    ),
    ...rows.flatMap((row) => [
      line(
        `${row.key}__inter_annotator`,
        `${row.name} inter-annotator agreement`,
        row.color,
        row.interAnnotator,
        { dashed: true },
      ),
      line(
        row.key,
        `${row.name} agreement with humans`,
        row.color,
        row.withHumans,
        {},
      ),
    ]),
  ];
}

