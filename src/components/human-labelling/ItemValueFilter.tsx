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

export type ValueFilterOption = {
  value: boolean | number;
  /** For the picker, where the level number tells the options apart. */
  label: string;
  /** For the tag, which reads as a sentence: the level's name on its own
   *  when it has one, otherwise the number. */
  shortLabel: string;
};

/** Whose answer a filter reads: the evaluator's, a human's, or a mix. */
export type ValueFilterSource = "evaluator" | "human" | "either" | "both";

export const VALUE_FILTER_SOURCES: readonly {
  value: ValueFilterSource;
  /** For the picker. */
  label: string;
  /** For the tag, read after the value: "Correctness is Wrong by a human". */
  phrase: string;
}[] = [
  { value: "either", label: "By the evaluator or a human", phrase: "by the evaluator or a human" },
  { value: "evaluator", label: "By the evaluator", phrase: "by the evaluator" },
  { value: "human", label: "By a human", phrase: "by a human" },
  { value: "both", label: "By the evaluator and a human", phrase: "by the evaluator and a human" },
];

export type ValueFilter = {
  evaluatorId: string;
  /** Empty means "no value picked yet" — the filter is inert. */
  values: (boolean | number)[];
  /** Only set where the caller asks whose answer to read (`showSource`). */
  source?: ValueFilterSource;
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
      const name = named?.find((e) => e.value === value)?.name?.trim();
      return {
        value,
        label: name ? `${value} — ${name}` : String(value),
        shortLabel: name || String(value),
      };
    });
  }
  const binaryScale = binaryScaleFor(ev.output_type, scale);
  return [true, false].map((value) => {
    const label = getBinaryLabel(binaryScale, value);
    return { value, label, shortLabel: label };
  });
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
 * The tag's wording, split so the evaluator and the picked scores can be
 * emphasised and the joining "is" played down. Past two picked values the
 * list would crowd the bar, so it collapses to a count instead.
 */
export function valueFilterTagParts(
  ev: ValueFilterEvaluator,
  filter: ValueFilter,
): { name: string; values: string | null; source: string | null } {
  const options = valueFilterOptions(ev);
  const labels = filter.values.map(
    (v) => options.find((o) => o.value === v)?.shortLabel ?? String(v),
  );
  const name = evaluatorFilterName(ev);
  const source =
    VALUE_FILTER_SOURCES.find((s) => s.value === filter.source)?.phrase ?? null;
  if (labels.length === 0) return { name, values: null, source };
  if (labels.length === 1) return { name, values: labels[0], source };
  if (labels.length === 2)
    return { name, values: `${labels[0]} or ${labels[1]}`, source };
  return { name, values: `${labels.length} of ${options.length} scores`, source };
}

/** The same wording as one string, for labels read out to screen readers. */
export function describeValueFilter(
  ev: ValueFilterEvaluator,
  filter: ValueFilter,
): string {
  const { name, values, source } = valueFilterTagParts(ev, filter);
  if (!values) return name;
  return source ? `${name} is ${values} ${source}` : `${name} is ${values}`;
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

// `accent` in this app is a near-white surface tint (#f5f5f5), not a brand
// colour, so it must never be used for text. An active tag reads as "on"
// the same way the rest of the app does it: solid foreground on background.
const tagClass =
  "h-7 pl-3 pr-1.5 rounded-full text-xs font-medium border border-foreground bg-foreground text-background inline-flex items-center gap-2";

export function ItemValueFilter({
  evaluators,
  filters,
  onChange,
  showSource = false,
}: {
  evaluators: readonly ValueFilterEvaluator[];
  filters: readonly ValueFilter[];
  onChange: (next: ValueFilter[]) => void;
  /** Ask whose answer each filter reads. Off where there is only one kind. */
  showSource?: boolean;
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

  const filterFor = (evaluatorId: string) =>
    filters.find((f) => f.evaluatorId === evaluatorId);
  const valuesFor = (evaluatorId: string) => filterFor(evaluatorId)?.values ?? [];
  const sourceFor = (evaluatorId: string): ValueFilterSource =>
    filterFor(evaluatorId)?.source ?? "either";

  // Replace in place when the tag already exists, so editing it does not
  // shuffle it to the end of the bar under the user's cursor.
  const upsert = (next: ValueFilter) =>
    onChange(
      filterFor(next.evaluatorId)
        ? filters.map((f) => (f.evaluatorId === next.evaluatorId ? next : f))
        : [...filters, next],
    );

  const remove = (evaluatorId: string) =>
    onChange(filters.filter((f) => f.evaluatorId !== evaluatorId));

  // Only a page that offers the source choice names it, and there a filter
  // with none (an older link) reads as the default it is sent as.
  const shownFilter = (f: ValueFilter): ValueFilter =>
    showSource ? { ...f, source: f.source ?? "either" } : { ...f, source: undefined };

  const setValues = (evaluatorId: string, values: (boolean | number)[]) => {
    // With the source choice on, an emptied tag keeps its entry so the source
    // picked in the open panel survives. An entry with no values filters
    // nothing and is never sent or written to the address.
    if (values.length === 0 && !showSource) {
      remove(evaluatorId);
      return;
    }
    upsert(
      showSource
        ? { evaluatorId, values, source: sourceFor(evaluatorId) }
        : { evaluatorId, values },
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
              {(() => {
                const { name, values, source } = valueFilterTagParts(ev, shownFilter(f));
                return (
                  <>
                    <span className="font-semibold">{name}</span>
                    {values && (
                      <>
                        <span className="font-normal opacity-60"> is </span>
                        <span className="font-semibold">{values}</span>
                        {source && (
                          <span className="font-normal opacity-60">
                            {" "}
                            {source}
                          </span>
                        )}
                      </>
                    )}
                  </>
                );
              })()}
            </button>
            <button
              type="button"
              aria-label={`Remove ${describeValueFilter(ev, shownFilter(f))}`}
              onClick={() => {
                if (openFor === f.evaluatorId) close();
                remove(f.evaluatorId);
              }}
              className="w-4 h-4 rounded-full inline-flex items-center justify-center opacity-70 hover:opacity-100 hover:bg-background/25 transition-opacity cursor-pointer"
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
          className={`h-7 px-3 rounded-full text-xs font-medium text-white border transition-colors cursor-pointer ${
            picking
              ? "bg-blue-700 border-blue-700"
              : "bg-blue-600 border-blue-600 hover:bg-blue-700 hover:border-blue-700"
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
        <div className={`absolute left-0 top-full z-30 mt-1.5 ${showSource ? "w-72" : "w-60"} rounded-lg border border-border bg-background shadow-lg p-1`}>
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
                {showSource && (
                  <div
                    role="radiogroup"
                    aria-label="Whose answer"
                    className="mt-1 pt-1 border-t border-border"
                  >
                    <p className="px-2.5 pt-1.5 pb-1 text-[11px] text-muted-foreground">
                      Whose answer
                    </p>
                    {VALUE_FILTER_SOURCES.map((s) => {
                      const selected = sourceFor(openEvaluator.uuid) === s.value;
                      return (
                        <button
                          key={s.value}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          onClick={() =>
                            upsert({
                              evaluatorId: openEvaluator.uuid,
                              values: valuesFor(openEvaluator.uuid),
                              source: s.value,
                            })
                          }
                          className="w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm text-left hover:bg-muted/60 transition-colors cursor-pointer"
                        >
                          <span
                            aria-hidden="true"
                            className={`w-4 h-4 shrink-0 rounded-full border inline-flex items-center justify-center ${
                              selected
                                ? "border-foreground"
                                : "border-foreground/40"
                            }`}
                          >
                            {selected && (
                              <span className="w-2 h-2 rounded-full bg-foreground" />
                            )}
                          </span>
                          <span className="truncate">{s.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )
          )}
        </div>
      )}
    </div>
  );
}
