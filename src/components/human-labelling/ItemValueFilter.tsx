"use client";

import React from "react";
import { Select } from "@/components/ui/Select";
import {
  binaryScaleFor,
  coerceBinaryValue,
  getBinaryLabel,
  toRatingScale,
  type BinaryScaleEntryLike,
} from "@/lib/binaryLabels";

/**
 * Shared "show only items scored X" filter for the two item-carousel
 * views: the evaluation run page (filters on the evaluator's own score)
 * and the labelling job admin view (filters on the annotator's answer).
 * Both load every item up front, so filtering is purely local.
 *
 * One evaluator at a time, any number of that evaluator's values.
 */

/** Minimal evaluator shape both callers already have on hand. */
export type ValueFilterEvaluator = {
  uuid: string;
  name?: string | null;
  output_type?: string | null;
  scale_min?: number | null;
  scale_max?: number | null;
  output_config?: { scale?: BinaryScaleEntryLike[] | null } | null;
};

export type ValueFilterOption = { value: boolean | number; label: string };

export type ValueFilter = {
  evaluatorId: string;
  /** Empty means "no value picked yet" — the filter is inert. */
  values: (boolean | number)[];
};

/**
 * The values a user can pick for one evaluator.
 *
 * Binary evaluators always offer both verdicts, labelled with the
 * evaluator's own wording. Rating evaluators offer one option per level.
 * We do NOT guess a 1..5 default when the bounds are missing — same rule
 * as `EvaluatorVerdictCard`, which surfaces an error rather than render a
 * scale that may not match the rubric. Here the evaluator is simply left
 * out of the filter (see `valueFilterEvaluators`).
 */
export function valueFilterOptions(
  ev: ValueFilterEvaluator,
): ValueFilterOption[] {
  const scale = ev.output_config?.scale ?? null;
  if (ev.output_type === "rating") {
    const { scale_min: min, scale_max: max } = ev;
    if (typeof min !== "number" || typeof max !== "number" || max < min) {
      return [];
    }
    const named = toRatingScale(scale);
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const value = min + i;
      const label = named?.find((e) => e.value === value)?.name?.trim();
      return { value, label: label ? `${value} — ${label}` : String(value) };
    });
  }
  const binaryScale = binaryScaleFor(ev.output_type, scale);
  return [true, false].map((value) => ({
    value,
    label: getBinaryLabel(binaryScale, value),
  }));
}

/**
 * Evaluators that can actually be filtered on (i.e. have options), one per
 * evaluator.
 *
 * The run page's list holds one row per pinned version, so the same
 * evaluator can appear more than once. The filter is keyed by evaluator
 * uuid alone, so without this the dropdown would list a name twice and the
 * rating levels would come from whichever version happened to be first.
 */
export function valueFilterEvaluators<T extends ValueFilterEvaluator>(
  evaluators: readonly T[],
): T[] {
  const seen = new Set<string>();
  return evaluators.filter((ev) => {
    if (seen.has(ev.uuid) || valueFilterOptions(ev).length === 0) return false;
    seen.add(ev.uuid);
    return true;
  });
}

/**
 * Does a recorded score match any of the picked values?
 *
 * Binary values go through `coerceBinaryValue` so scores stored as 1/0 or
 * "yes"/"no" still match. Rating values must be numbers, so a boolean
 * `true` can never satisfy a rating level of 1.
 */
export function matchesValueFilter(
  score: unknown,
  values: readonly (boolean | number)[],
): boolean {
  return values.some((v) =>
    typeof v === "boolean"
      ? coerceBinaryValue(score) === v
      : typeof score === "number" && score === v,
  );
}

/**
 * True when the filter is set up enough to narrow anything. Narrows the
 * type too, so callers do not need a second null check to read the fields.
 */
export function isValueFilterActive(
  filter: ValueFilter | null,
): filter is ValueFilter {
  return !!filter && filter.values.length > 0;
}

export function ItemValueFilter({
  evaluators,
  filter,
  onChange,
}: {
  evaluators: readonly ValueFilterEvaluator[];
  filter: ValueFilter | null;
  onChange: (next: ValueFilter | null) => void;
}) {
  const filterable = valueFilterEvaluators(evaluators);
  if (filterable.length === 0) return null;

  const selected =
    filterable.find((ev) => ev.uuid === filter?.evaluatorId) ?? null;
  const options = selected ? valueFilterOptions(selected) : [];
  const picked = filter?.values ?? [];

  const toggle = (value: boolean | number) => {
    if (!selected) return;
    const next = picked.includes(value)
      ? picked.filter((v) => v !== value)
      : [...picked, value];
    onChange({ evaluatorId: selected.uuid, values: next });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground">Show items scored</span>
      <Select
        aria-label="Filter by evaluator"
        value={selected?.uuid ?? ""}
        onChange={(e) =>
          onChange(
            e.target.value ? { evaluatorId: e.target.value, values: [] } : null,
          )
        }
        wrapperClassName="w-auto"
        className="h-8 text-xs font-medium cursor-pointer"
      >
        <option value="">Any evaluator</option>
        {filterable.map((ev) => (
          <option key={ev.uuid} value={ev.uuid}>
            {ev.name?.trim() || ev.uuid.slice(0, 8)}
          </option>
        ))}
      </Select>
      {options.map((opt) => {
        const active = picked.includes(opt.value);
        return (
          <button
            key={String(opt.value)}
            type="button"
            aria-pressed={active}
            onClick={() => toggle(opt.value)}
            className={`h-8 px-3 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
              active
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-foreground hover:bg-muted/50"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
      {isValueFilterActive(filter) && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="h-8 px-3 rounded-md text-xs font-medium border border-border bg-muted/60 text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          Clear
        </button>
      )}
    </div>
  );
}
