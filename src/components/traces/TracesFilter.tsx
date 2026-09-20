"use client";

import React, { useEffect, useRef, useState } from "react";
import { SegmentedFilter } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { FilterIcon } from "@/components/icons";
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

/**
 * What one evaluator can be narrowed by. A yes-or-no evaluator offers its two
 * verdicts, in the same words its cells use. A rating offers each score on its
 * scale, and each score with everything below it, which is how a reader looks
 * for the poor answers. Neither end gets an "or below": on the lowest score it
 * would mean the same as the score itself, and on the highest it would mean
 * the whole scale.
 */
export function scoreConditionOptions(
  evaluator: TraceScoreFilterEvaluator,
  // `value` is the condition sent to the backend, e.g. "failed" or "<=3";
  // `label` is what the option reads as beside the evaluator's name.
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
      label: `Scored ${value}`,
    })),
    ...values.slice(1, -1).map((value) => ({
      value: `<=${value}`,
      label: `Scored ${value} or below`,
    })),
  ];
}

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

  // Closing drops the draft: what is on screen behind the panel is what was
  // applied, so an unapplied tick must not survive the next opening.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const activeCount = traceFilterCount(value);
  const draftCount = traceFilterCount(draft);

  const openPanel = () => {
    setDraft(value);
    setLabelSearch("");
    setOpen(true);
  };

  const setScore = (evaluatorUuid: string, condition: string) =>
    setDraft((d) => {
      const scores = { ...d.scores };
      if (condition) scores[evaluatorUuid] = condition;
      else delete scores[evaluatorUuid];
      return { ...d, scores };
    });

  const toggleLabel = (label: string) =>
    setDraft((d) => ({
      ...d,
      labels: d.labels.includes(label)
        ? d.labels.filter((l) => l !== label)
        : [...d.labels, label],
    }));

  const shown = labelSearch.trim()
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
        <div className="absolute left-0 top-full mt-2 z-30 w-72 rounded-lg border border-border bg-background shadow-lg p-3">
          <p className="text-xs text-muted-foreground mb-1.5">Output</p>
          <SegmentedFilter
            value={draft.outputType}
            onChange={(outputType) => setDraft((d) => ({ ...d, outputType }))}
            options={OUTPUT_FILTER_OPTIONS}
            size="sm"
            ariaLabel="Filter traces by output"
          />

          {scoreEvaluators.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-3 mb-1.5">
                Scores
              </p>
              <div className="space-y-1.5">
                {scoreEvaluators.map((evaluator) => (
                  <label
                    key={evaluator.evaluator_uuid}
                    className="flex items-center gap-2"
                  >
                    <span className="flex-1 min-w-0 truncate text-sm">
                      {evaluator.name}
                    </span>
                    <select
                      value={draft.scores[evaluator.evaluator_uuid] ?? ""}
                      onChange={(e) =>
                        setScore(evaluator.evaluator_uuid, e.target.value)
                      }
                      aria-label={`Filter traces by ${evaluator.name}`}
                      className="w-36 h-8 px-2 rounded-md text-sm border border-border bg-background text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
                    >
                      <option value="">Any score</option>
                      {scoreConditionOptions(evaluator).map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </>
          )}

          {labels.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground mt-3 mb-1.5">
                Labels
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
              <div className="max-h-48 overflow-y-auto">
                {shown.length === 0 ? (
                  <p className="text-sm text-muted-foreground px-1 py-2">
                    No labels match your search
                  </p>
                ) : (
                  shown.map((label) => {
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
            </>
          )}

          <div className="flex items-center justify-between border-t border-border mt-3 pt-3">
            <button
              type="button"
              onClick={() =>
                setDraft({ outputType: "all", labels: [], scores: {} })
              }
              disabled={draftCount === 0}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
