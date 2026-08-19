// Turns one evaluator's rolled-up outputs into the single number shown on
// its card: the share of items it marked true (binary), or the mean score
// (rating).
//
// Two places produce those counts and both must read the same way:
// the evaluator run page counts the run's own rows in the browser, and the
// task page gets them from `GET /annotation-tasks/{uuid}/agreement`, which
// counts across every item in the task. Only the counting differs, so the
// formatting lives here.

import {
  binaryScaleFor,
  getBinaryLabel,
  type BinaryScaleEntryLike,
} from "@/lib/binaryLabels";
import { formatPercent, formatRating } from "@/lib/llmMetrics";
import type { EvaluatorResultStat } from "@/components/human-labelling/AgreementStatCard";

/** How many items the evaluator produced a usable value for, and what those
 * values came to. A binary evaluator fills `trueCount`, a rating evaluator
 * fills `mean`. */
export type EvaluatorResultCounts = {
  count: number;
  trueCount?: number | null;
  mean?: number | null;
};

/** The scale metadata needed to label and colour the number. */
export type EvaluatorResultScale = {
  output_type?: string | null;
  scale_min?: number | null;
  scale_max?: number | null;
  output_config?: { scale?: readonly BinaryScaleEntryLike[] | null } | null;
};

/** What one score in the count is.
 *
 * An evaluator scores each item once, so its count is a number of items. A
 * person labels an item once each, so an item three people labelled puts
 * three scores into the count. Saying "57 items" for that would be wrong,
 * hence the two words. */
export type EvaluatorResultUnit = "item" | "label";

const countWord = (n: number, unit: EvaluatorResultUnit) =>
  `${n} ${unit}${n === 1 ? "" : "s"}`;

export function formatEvaluatorResultStat(
  counts: EvaluatorResultCounts | null | undefined,
  ev: EvaluatorResultScale | null,
  unit: EvaluatorResultUnit = "item",
): EvaluatorResultStat | null {
  if (!counts || counts.count <= 0) return null;

  if (ev?.output_type === "rating") {
    const avg = counts.mean;
    if (typeof avg !== "number" || !Number.isFinite(avg)) return null;
    const max = typeof ev?.scale_max === "number" ? ev.scale_max : null;
    const min = typeof ev?.scale_min === "number" ? ev.scale_min : 0;
    const rounded = formatRating(avg);
    return {
      label: "Score",
      value: max != null ? `${rounded} / ${max}` : rounded,
      title: `Average across ${countWord(counts.count, unit)}`,
      ratio: max != null && max > min ? (avg - min) / (max - min) : null,
    };
  }

  const trueCount = counts.trueCount;
  if (typeof trueCount !== "number" || !Number.isFinite(trueCount)) return null;
  // The verdict word (Correct / Pass / whatever the evaluator calls it) goes
  // in the hover text, not the label, so every card reads "Score".
  const trueLabel = getBinaryLabel(
    binaryScaleFor(ev?.output_type, ev?.output_config?.scale),
    true,
  );
  return {
    label: "Score",
    value: formatPercent((trueCount / counts.count) * 100, 0),
    title: `${trueLabel} on ${trueCount} of ${countWord(counts.count, unit)}`,
    ratio: trueCount / counts.count,
  };
}

/** Count a list of raw judgement values into the one number a card shows.
 *
 * The values can come from an evaluator's own runs or from the labels people
 * gave, so both read the same way on screen. Values of the wrong shape for
 * the evaluator (a number where a yes/no is expected, or a blank) are left
 * out of the count rather than guessed at.
 */
export function summariseValues(
  values: readonly unknown[],
  ev: EvaluatorResultScale | null,
  unit: EvaluatorResultUnit = "item",
): EvaluatorResultStat | null {
  if (ev?.output_type === "rating") {
    const numbers = values.filter(
      (v): v is number => typeof v === "number" && Number.isFinite(v),
    );
    return formatEvaluatorResultStat(
      {
        count: numbers.length,
        mean: numbers.length
          ? numbers.reduce((a, b) => a + b, 0) / numbers.length
          : null,
      },
      ev,
      unit,
    );
  }
  const bools = values.filter((v): v is boolean => typeof v === "boolean");
  return formatEvaluatorResultStat(
    { count: bools.length, trueCount: bools.filter(Boolean).length },
    ev,
    unit,
  );
}
