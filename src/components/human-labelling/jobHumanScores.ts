// Rolls one labelling job's saved answers into the number shown on each
// evaluator's card, so a job reads the same way as an evaluator run.

import { summariseValues } from "@/lib/evaluatorResultStat";
import type { EvaluatorResultScale } from "@/lib/evaluatorResultStat";
import type { EvaluatorScoreCard } from "@/components/human-labelling/EvaluatorScoreCards";

type JobEvaluator = EvaluatorResultScale & { uuid: string; name: string };

type JobAnnotation = {
  item_id: string;
  /** Null on the item's own comment, which is not a judgement. */
  evaluator_id: string | null;
  /** Either the bare answer or `{ value, comment }`. */
  value: unknown;
};

/** An answer is stored either bare or wrapped alongside its comment. */
export function readSavedValue(v: unknown): unknown {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

/** One card per evaluator the annotator scored, in the order given. */
export function buildJobHumanScoreCards(
  evaluators: readonly JobEvaluator[],
  annotations: readonly JobAnnotation[],
): EvaluatorScoreCard[] {
  const cards: EvaluatorScoreCard[] = [];
  for (const ev of evaluators) {
    // The backend keeps at most one answer per item and evaluator, and a job
    // has one annotator, so every matching row is a separate item's answer.
    const values = annotations
      .filter((a) => a.evaluator_id === ev.uuid)
      .map((a) => readSavedValue(a.value));
    const stat = summariseValues(values, ev);
    if (stat) cards.push({ evaluatorId: ev.uuid, name: ev.name, stat });
  }
  return cards;
}
