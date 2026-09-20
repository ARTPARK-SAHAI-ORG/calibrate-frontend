"use client";

import React from "react";
import { Select } from "@/components/ui/Select";
import { defaultBinaryLabel } from "@/lib/binaryLabels";
import type { TraceScoreFilters } from "@/lib/tracesApi";

/** One evaluator the list can be narrowed by, with whatever the scores on the
 *  page say about how it judges. A rating is offered by its numbers, so an
 *  evaluator whose scale is not known yet falls back to the verdict. */
export type TraceScoreFilterEvaluator = {
  evaluator_uuid: string;
  name: string;
  output_type?: "binary" | "rating" | null;
  scale_min?: number | null;
  scale_max?: number | null;
};

/**
 * What one evaluator can be filtered by. A yes-or-no evaluator offers its two
 * verdicts, in the same words its cells use. A rating offers each score on its
 * scale, and each score with everything below it, which is how a reader looks
 * for the poor answers. Neither end gets an "or below": on the lowest score it
 * would mean the same as the score itself, and on the highest it would mean
 * the whole scale.
 */
export function scoreConditionOptions(
  evaluator: TraceScoreFilterEvaluator,
  // `value` is the condition sent to the backend, e.g. "failed" or "<=3";
  // `label` is what the option reads as without the evaluator's name.
): { value: string; label: string }[] {
  const min = evaluator.scale_min;
  const max = evaluator.scale_max;
  if (
    evaluator.output_type !== "rating" ||
    typeof min !== "number" ||
    typeof max !== "number" ||
    max <= min
  ) {
    return [
      { value: "passed", label: defaultBinaryLabel(true) },
      { value: "failed", label: defaultBinaryLabel(false) },
    ];
  }
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return [
    ...values.map((value) => ({
      value: `=${value}`,
      label: `scored ${value}`,
    })),
    ...values.slice(1, -1).map((value) => ({
      value: `<=${value}`,
      label: `scored ${value} or below`,
    })),
  ];
}

/**
 * One picker per evaluator, narrowing the list to the traces it scored a
 * certain way. Every picked condition has to hold, so two of them together
 * read as "this evaluator said X and that one said Y".
 */
export function TraceScoreFilterBar({
  evaluators,
  value,
  onChange,
}: {
  evaluators: TraceScoreFilterEvaluator[];
  value: TraceScoreFilters;
  onChange: (next: TraceScoreFilters) => void;
}) {
  if (evaluators.length === 0) return null;
  return (
    <>
      {evaluators.map((evaluator) => {
        const options = scoreConditionOptions(evaluator);
        return (
          <Select
            key={evaluator.evaluator_uuid}
            aria-label={`Filter traces by ${evaluator.name}`}
            wrapperClassName="w-full sm:w-48"
            value={value[evaluator.evaluator_uuid] ?? ""}
            onChange={(event) => {
              const next = { ...value };
              if (event.target.value) {
                next[evaluator.evaluator_uuid] = event.target.value;
              } else {
                delete next[evaluator.evaluator_uuid];
              }
              onChange(next);
            }}
          >
            <option value="">{evaluator.name}: any score</option>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {evaluator.name}: {option.label}
              </option>
            ))}
          </Select>
        );
      })}
    </>
  );
}
