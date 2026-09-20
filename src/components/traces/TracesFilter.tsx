"use client";

import React, { Fragment, useRef, useState } from "react";
import { SegmentedFilter } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import {
  ChevronDownIcon,
  FilterIcon,
  PlusIcon,
  XIcon,
} from "@/components/icons";
import { defaultBinaryLabel } from "@/lib/binaryLabels";
import type { TraceOutputFilter, TraceScoreFilters } from "@/lib/tracesApi";

/** What a trace's output can be filtered down to. A trace that both replied
 *  and called tools counts as a reply, which is also how "Add to tests"
 *  decides: one selected trace with a reply makes the whole batch judge
 *  replies. */
const OUTPUT_FILTER_OPTIONS: { value: TraceOutputFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "response", label: "Response" },
  { value: "tool_call", label: "Tool call" },
];

/** Past this many labels the list is worth searching rather than scrolling. */
const SEARCH_LABELS_FROM = 8;

/** One evaluator the list can be narrowed by, with whatever the scores the
 *  page has seen say about how it judges. A rating is offered by its numbers,
 *  so an evaluator whose scale is not known yet falls back to the verdict. */
export type TraceScoreFilterEvaluator = {
  evaluator_uuid: string;
  name: string;
  output_type?: "binary" | "rating" | null;
  scale_min?: number | null;
  scale_max?: number | null;
};

/** How an option should read: a verdict the evaluator gives, or a plain score. */
export type ScoreConditionTone = "pass" | "fail" | "neutral";

/**
 * What one evaluator can be narrowed by. A yes-or-no evaluator offers its two
 * verdicts, in the same words and colours its cells use. A rating offers each
 * score on its scale, and each score with everything below it, which is how a
 * reader looks for the poor answers. Neither end gets an "or below": on the
 * lowest score it would mean the same as the score itself, and on the highest
 * it would mean the whole scale.
 */
export function scoreConditionOptions(
  evaluator: TraceScoreFilterEvaluator,
  // `value` is the condition sent to the backend, e.g. "failed" or "<=3";
  // `label` is what the option reads as under the evaluator's name.
): { value: string; label: string; tone: ScoreConditionTone }[] {
  const min = evaluator.scale_min;
  const max = evaluator.scale_max;
  if (
    evaluator.output_type !== "rating" ||
    typeof min !== "number" ||
    typeof max !== "number" ||
    !Number.isInteger(min) ||
    !Number.isInteger(max) ||
    max <= min
  ) {
    return [
      { value: "passed", label: defaultBinaryLabel(true), tone: "pass" },
      { value: "failed", label: defaultBinaryLabel(false), tone: "fail" },
    ];
  }
  const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
  return [
    ...values.map((value) => ({
      value: `=${value}`,
      label: String(value),
      tone: "neutral" as const,
    })),
    ...values.slice(1, -1).map((value) => ({
      value: `<=${value}`,
      label: `${value} or below`,
      tone: "neutral" as const,
    })),
  ];
}

/** The same colours a score wears in the table, so one reads as the other. */
const TONE_CLASS: Record<ScoreConditionTone, string> = {
  pass: "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500",
  fail: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500",
  neutral: "bg-muted text-foreground",
};

export type TracesFilterValue = {
  outputType: TraceOutputFilter;
  labels: string[];
  /** One condition per evaluator, all of which have to hold. */
  scores: TraceScoreFilters;
};

/** How many choices are on, so the button can say so without being opened.
 *  Each picked label counts, since that is what the reader ticked, and so does
 *  each evaluator the reader has set a condition on. */
function traceFilterCount(value: TracesFilterValue): number {
  return (
    (value.outputType === "all" ? 0 : 1) +
    value.labels.length +
    Object.keys(value.scores).length
  );
}

/**
 * The one control that narrows the traces list, beside the search box: an icon
 * button carrying how many choices are on, opening a panel that holds both the
 * output kind and the labels. Nothing changes until Apply, so ticking several
 * labels asks the backend once rather than once per tick.
 */
export function TracesFilter({
  value,
  labels,
  scoreEvaluators = [],
  onApply,
}: {
  value: TracesFilterValue;
  /** Every label the agent's traces carry, not just the ones on this page. */
  labels: string[];
  /** The evaluators that score this agent's traces. None leaves the scores
   *  section out, the way no labels leaves the labels section out. */
  scoreEvaluators?: TraceScoreFilterEvaluator[];
  onApply: (next: TracesFilterValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<TracesFilterValue>(value);
  const [labelSearch, setLabelSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(open, rootRef, () => setOpen(false));

  const activeCount = traceFilterCount(value);
  const draftCount = traceFilterCount(draft);

  const openPanel = () => {
    // A condition naming an evaluator this agent no longer has would be
    // counted and re-sent with no row to turn it off, so opening the panel
    // lets go of it: Apply then clears it.
    const known = new Set(
      scoreEvaluators.map((evaluator) => evaluator.evaluator_uuid),
    );
    setDraft({
      ...value,
      scores: Object.fromEntries(
        Object.entries(value.scores).filter(([uuid]) => known.has(uuid)),
      ),
    });
    setLabelSearch("");
    setOpen(true);
  };

  const setScore = (evaluatorUuid: string, condition: string) =>
    setDraft((d) => ({
      ...d,
      scores: { ...d.scores, [evaluatorUuid]: condition },
    }));

  const addEvaluator = (evaluator: TraceScoreFilterEvaluator) =>
    setScore(
      evaluator.evaluator_uuid,
      scoreConditionOptions(evaluator)[0].value,
    );

  /** Taking the evaluator off the panel is how its condition is cleared:
   *  there is no "any score" to go back to. */
  const removeEvaluator = (evaluatorUuid: string) => {
    setDraft((d) => {
      const scores = { ...d.scores };
      delete scores[evaluatorUuid];
      return { ...d, scores };
    });
  };

  const toggleLabel = (label: string) =>
    setDraft((d) => ({
      ...d,
      labels: d.labels.includes(label)
        ? d.labels.filter((l) => l !== label)
        : [...d.labels, label],
    }));

  // In the order the reader added them, not the order the columns happen to
  // be in: a condition is written into `draft.scores` when it is picked, and
  // changing one later keeps its place.
  const byUuid = new Map(
    scoreEvaluators.map((evaluator) => [evaluator.evaluator_uuid, evaluator]),
  );
  const shown = Object.keys(draft.scores).flatMap(
    (uuid) => byUuid.get(uuid) ?? [],
  );
  const addable = scoreEvaluators.filter(
    (evaluator) => !(evaluator.evaluator_uuid in draft.scores),
  );

  const shownLabels = labelSearch.trim()
    ? labels.filter((l) =>
        l.toLowerCase().includes(labelSearch.trim().toLowerCase()),
      )
    : labels;

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip content="Filter traces" position="top">
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPanel())}
          aria-label="Filter traces"
          aria-expanded={open}
          className={`relative w-10 h-10 rounded-md border bg-background flex items-center justify-center cursor-pointer transition-colors hover:bg-muted/50 ${
            activeCount > 0 ? "border-foreground" : "border-border"
          }`}
        >
          <FilterIcon className="w-5 h-5" />
          {activeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[1rem] h-4 px-1 rounded-full bg-foreground text-background text-[11px] leading-4 font-medium">
              {activeCount}
            </span>
          )}
        </button>
      </Tooltip>

      {open && (
        // ponytail: positioned against the button, not portalled. It opens
        // downward from a toolbar at the top of the tab, so there is room.
        // Switch to a portal if it ever gets clipped.
        <div className="absolute left-0 top-full mt-2 z-30 w-max min-w-[min(30rem,calc(100vw-2rem))] max-w-[min(44rem,calc(100vw-2rem))] rounded-lg border border-border bg-background shadow-lg p-5">
          <p className="text-sm font-medium text-foreground mb-2">
            Filter by output type
          </p>
          <SegmentedFilter
            value={draft.outputType}
            onChange={(outputType) => setDraft((d) => ({ ...d, outputType }))}
            options={OUTPUT_FILTER_OPTIONS}
            className="w-fit"
            ariaLabel="Filter traces by output"
          />

          {scoreEvaluators.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-2">
                Filter by scores
              </p>
              {/* Every evaluator stays on offer here; picking one adds a row
                  underneath. The chips never decide the panel's width, so a
                  long list wraps rather than stretching it. */}
              {addable.length > 0 && (
                <div className="w-0 min-w-full flex flex-wrap gap-2">
                  {addable.map((evaluator) => (
                    <button
                      key={evaluator.evaluator_uuid}
                      type="button"
                      onClick={() => addEvaluator(evaluator)}
                      className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-dashed border-border text-sm text-muted-foreground hover:text-foreground hover:border-foreground transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <PlusIcon className="w-3.5 h-3.5" />
                      {evaluator.name}
                    </button>
                  ))}
                </div>
              )}
              {shown.length > 0 && (
                // One column sized to the longest name, so every dropdown
                // starts in the same place whatever the names are.
                <div className="grid w-full grid-cols-[1fr_max-content_max-content] items-center gap-x-4 gap-y-3 mt-4">
                  {shown.map((evaluator) => {
                    const known = scoreConditionOptions(evaluator);
                    const picked = draft.scores[evaluator.evaluator_uuid];
                    // A condition from the address bar can name something this
                    // evaluator no longer offers, and a select whose value
                    // matches no option renders blank. Show it as itself.
                    const options =
                      picked && !known.some((o) => o.value === picked)
                        ? [
                            {
                              value: picked,
                              label: picked,
                              tone: "neutral" as const,
                            },
                            ...known,
                          ]
                        : known;
                    const tone =
                      options.find((option) => option.value === picked)?.tone ??
                      "neutral";
                    return (
                      <Fragment key={evaluator.evaluator_uuid}>
                        <span className="text-sm whitespace-nowrap">
                          {evaluator.name}
                        </span>
                        {/* Built like the app's Select (own chevron, room to
                            its right) rather than using it, because the
                            shared one paints its own background and the
                            picked verdict has to keep the colour it wears in
                            the table. */}
                        <div className="relative w-40">
                          <select
                            value={picked ?? ""}
                            onChange={(e) =>
                              setScore(evaluator.evaluator_uuid, e.target.value)
                            }
                            aria-label={`Filter traces by ${evaluator.name}`}
                            className={`appearance-none w-full h-9 pl-3 pr-9 rounded-md text-sm font-medium border border-border cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent ${TONE_CLASS[tone]}`}
                          >
                            {options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          <ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4" />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            removeEvaluator(evaluator.evaluator_uuid)
                          }
                          aria-label={`Remove the ${evaluator.name} filter`}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                        >
                          <XIcon className="w-4 h-4" />
                        </button>
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {labels.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-sm font-medium text-foreground mb-2">
                Filter by trace labels
              </p>
              {labels.length > SEARCH_LABELS_FROM && (
                <input
                  type="text"
                  value={labelSearch}
                  onChange={(e) => setLabelSearch(e.target.value)}
                  placeholder="Search labels"
                  aria-label="Search labels"
                  className="w-full h-8 px-2 mb-1 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              )}
              <div className="w-0 min-w-full max-h-48 overflow-y-auto">
                {shownLabels.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-2">
                    No labels match your search
                  </p>
                ) : (
                  shownLabels.map((label) => {
                    const checked = draft.labels.includes(label);
                    return (
                      <label
                        key={label}
                        className="w-full flex items-center gap-2 px-1 py-1.5 rounded text-sm cursor-pointer hover:bg-muted/50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleLabel(label)}
                          className="w-4 h-4 flex-shrink-0 cursor-pointer accent-foreground"
                        />
                        <span className="truncate">{label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between border-t border-border mt-5 pt-4">
            <button
              type="button"
              onClick={() =>
                setDraft({ outputType: "all", labels: [], scores: {} })
              }
              disabled={draftCount === 0}
              className="text-sm font-medium text-foreground hover:opacity-70 transition-opacity cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear all filters
            </button>
            {/* The count on the button rather than on the panel: it is the
                reader's own ticking read back to them, beside the thing that
                acts on it, since the number on the toolbar cannot move until
                this is pressed. */}
            <button
              type="button"
              onClick={() => {
                onApply(draft);
                setOpen(false);
              }}
              className="h-8 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              {draftCount > 0 ? `Apply (${draftCount})` : "Apply"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
