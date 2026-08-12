"use client";

import React, { useEffect, useRef, useState } from "react";
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
 * Each choice becomes a removable tag reading "Correctness is Wrong".
 * Several tags can be on at once and an item has to satisfy all of them.
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
 * How a caller looks up one item's scores for one evaluator. A list, not a
 * single value: the run page can hold one score per evaluator version, and
 * any one of them matching counts.
 */
export type ScoreLookup = (
  itemUuid: string,
  evaluatorId: string,
) => readonly unknown[];

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

export function evaluatorFilterName(ev: ValueFilterEvaluator): string {
  return ev.name?.trim() || ev.uuid.slice(0, 8);
}

/**
 * The tag's wording, e.g. "Correctness is Wrong" or "Helpfulness is 1 or 2".
 * Past two picked values the list would crowd the bar, so it collapses to a
 * count instead.
 */
export function describeValueFilter(
  ev: ValueFilterEvaluator,
  filter: ValueFilter,
): string {
  const options = valueFilterOptions(ev);
  const labels = filter.values.map(
    (v) => options.find((o) => o.value === v)?.label ?? String(v),
  );
  const name = evaluatorFilterName(ev);
  if (labels.length === 0) return name;
  if (labels.length === 1) return `${name} is ${labels[0]}`;
  if (labels.length === 2) return `${name} is ${labels[0]} or ${labels[1]}`;
  return `${name} is ${labels.length} of ${options.length} scores`;
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

/** True when the filter is set up enough to narrow anything. */
export function isValueFilterActive(
  filter: ValueFilter | null | undefined,
): filter is ValueFilter {
  return !!filter && filter.values.length > 0;
}

/** The filters that will actually narrow the list. */
export function activeValueFilters(
  filters: readonly ValueFilter[],
): ValueFilter[] {
  return filters.filter(isValueFilterActive);
}

/**
 * The filters that both show as a tag AND narrow the list: active, and
 * pointing at an evaluator this view can actually filter on.
 *
 * Both jobs go through this one rule on purpose. Filter state outlives the
 * data it was made against — the run page keeps the same component instance
 * when you move between runs, so a filter picked on one run can arrive at a
 * run that never scored that evaluator. If the tag list and the item
 * filtering each decided separately, that filter would quietly hide items
 * with no tag on screen to explain it.
 */
export function usableValueFilters(
  filters: readonly ValueFilter[],
  evaluators: readonly ValueFilterEvaluator[],
): ValueFilter[] {
  const known = new Set(valueFilterEvaluators(evaluators).map((e) => e.uuid));
  return activeValueFilters(filters).filter((f) => known.has(f.evaluatorId));
}

/**
 * An item survives when it satisfies every usable filter. `scoresFor` reads
 * one item's scores for one evaluator — the run page reads its evaluator
 * rows, the labelling job reads the annotator's saved answers.
 */
export function matchesAllValueFilters(
  itemUuid: string,
  filters: readonly ValueFilter[],
  evaluators: readonly ValueFilterEvaluator[],
  scoresFor: ScoreLookup,
): boolean {
  return usableValueFilters(filters, evaluators).every((f) =>
    scoresFor(itemUuid, f.evaluatorId).some((score) =>
      matchesValueFilter(score, f.values),
    ),
  );
}

const tagClass =
  "h-7 pl-3 pr-1.5 rounded-full text-xs font-medium border border-accent/30 bg-accent/10 text-accent inline-flex items-center gap-2";

export function ItemValueFilter({
  evaluators,
  filters,
  onChange,
}: {
  evaluators: readonly ValueFilterEvaluator[];
  filters: readonly ValueFilter[];
  onChange: (next: ValueFilter[]) => void;
}) {
  const filterable = valueFilterEvaluators(evaluators);
  // `null` closed; a uuid opens straight onto that evaluator's scores,
  // which is what clicking an existing tag does.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setPicking(false);
    setOpenFor(null);
  };

  useEffect(() => {
    if (!picking && !openFor) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [picking, openFor]);

  if (filterable.length === 0) return null;

  const openEvaluator = filterable.find((ev) => ev.uuid === openFor) ?? null;
  const active = usableValueFilters(filters, evaluators);

  const valuesFor = (evaluatorId: string) =>
    filters.find((f) => f.evaluatorId === evaluatorId)?.values ?? [];

  const setValues = (evaluatorId: string, values: (boolean | number)[]) => {
    if (values.length === 0) {
      onChange(filters.filter((f) => f.evaluatorId !== evaluatorId));
      return;
    }
    // Replace in place when the tag already exists, so editing it does not
    // shuffle it to the end of the bar under the user's cursor.
    const existing = filters.some((f) => f.evaluatorId === evaluatorId);
    onChange(
      existing
        ? filters.map((f) =>
            f.evaluatorId === evaluatorId ? { evaluatorId, values } : f,
          )
        : [...filters, { evaluatorId, values }],
    );
  };

  const toggleValue = (evaluatorId: string, value: boolean | number) => {
    const current = valuesFor(evaluatorId);
    setValues(
      evaluatorId,
      current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value],
    );
  };

  // Only evaluators without a tag yet — an evaluator already filtered on is
  // edited by clicking its tag, not added a second time.
  const addable = filterable.filter(
    (ev) => !active.some((f) => f.evaluatorId === ev.uuid),
  );

  return (
    <div ref={rootRef} className="relative flex items-center gap-2 flex-wrap">
      {active.map((f) => {
        // `usableValueFilters` already dropped anything not in `filterable`,
        // so this always resolves.
        const ev = filterable.find((e) => e.uuid === f.evaluatorId)!;
        return (
          <span key={f.evaluatorId} className={tagClass}>
            <button
              type="button"
              onClick={() => {
                setPicking(false);
                setOpenFor((prev) =>
                  prev === f.evaluatorId ? null : f.evaluatorId,
                );
              }}
              className="cursor-pointer"
            >
              {describeValueFilter(ev, f)}
            </button>
            <button
              type="button"
              aria-label={`Remove ${describeValueFilter(ev, f)}`}
              onClick={() => {
                if (openFor === f.evaluatorId) close();
                setValues(f.evaluatorId, []);
              }}
              className="w-4 h-4 rounded-full inline-flex items-center justify-center hover:bg-accent hover:text-background transition-colors cursor-pointer"
            >
              <svg
                className="w-2.5 h-2.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </span>
        );
      })}

      {addable.length > 0 && (
        <button
          type="button"
          onClick={() => {
            setOpenFor(null);
            setPicking((p) => !p);
          }}
          className={`h-7 px-3 rounded-full text-xs font-medium border border-dashed transition-colors cursor-pointer ${
            picking
              ? "border-foreground text-foreground"
              : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground"
          }`}
        >
          + Add filter
        </button>
      )}

      {active.length > 1 && (
        <button
          type="button"
          onClick={() => onChange([])}
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors cursor-pointer"
        >
          Clear all
        </button>
      )}

      {(picking || openEvaluator) && (
        // ponytail: absolutely positioned, not portalled. It opens downward
        // from a bar near the top of a tall container, so there is room.
        // Switch to a portal if it ever gets clipped.
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-lg border border-border bg-background shadow-lg p-1">
          {picking ? (
            <>
              <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted-foreground">
                Filter by
              </p>
              {addable.map((ev) => (
                <button
                  key={ev.uuid}
                  type="button"
                  onClick={() => {
                    setPicking(false);
                    setOpenFor(ev.uuid);
                  }}
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm text-left hover:bg-muted/60 transition-colors cursor-pointer"
                >
                  <span className="truncate">{evaluatorFilterName(ev)}</span>
                  <span className="text-muted-foreground shrink-0">›</span>
                </button>
              ))}
            </>
          ) : (
            openEvaluator && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setOpenFor(null);
                    setPicking(true);
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                >
                  <span>‹</span>
                  <span className="truncate">
                    {evaluatorFilterName(openEvaluator)}
                  </span>
                </button>
                {valueFilterOptions(openEvaluator).map((opt) => {
                  const checked = valuesFor(openEvaluator.uuid).includes(
                    opt.value,
                  );
                  return (
                    <button
                      key={String(opt.value)}
                      type="button"
                      aria-pressed={checked}
                      onClick={() => toggleValue(openEvaluator.uuid, opt.value)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left hover:bg-muted/60 transition-colors cursor-pointer"
                    >
                      {/* A plain mark, not SelectCheckbox — that renders a
                          button, and a button inside this row's button is
                          invalid nesting. */}
                      <span
                        aria-hidden="true"
                        className={`w-4 h-4 shrink-0 rounded border inline-flex items-center justify-center ${
                          checked
                            ? "bg-foreground border-foreground text-background"
                            : "border-foreground/40"
                        }`}
                      >
                        {checked && (
                          <svg
                            className="w-2.5 h-2.5"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={4}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  );
                })}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
