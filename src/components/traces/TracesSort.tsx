"use client";

import React, { Fragment, useRef, useState } from "react";
import { SegmentedFilter, type SegmentedFilterOption } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { useDismissOnOutside } from "@/hooks/useDismissOnOutside";
import { ArrowDownIcon, SortIcon } from "@/components/icons";
import type { TraceSortOrder } from "@/lib/tracesApi";

/** Which way one evaluator's scores run, offered against every evaluator so
 *  the list can be sorted in one click rather than two. Each carries the
 *  arrow its own direction points, so the two are told apart without
 *  reading them. */
const ORDER_OPTIONS: SegmentedFilterOption<TraceSortOrder | "">[] = [
  {
    value: "asc",
    label: (
      <span className="inline-flex items-center gap-1">
        <ArrowDownIcon className="w-3 h-3 rotate-180" />
        Low to high
      </span>
    ),
  },
  {
    value: "desc",
    label: (
      <span className="inline-flex items-center gap-1">
        <ArrowDownIcon className="w-3 h-3" />
        High to low
      </span>
    ),
  },
];

export type TracesSortValue = {
  /** The evaluator the list is ordered by, or null for newest first. */
  evaluatorUuid: string | null;
  order: TraceSortOrder;
};

/**
 * The one control that sorts the traces list, beside the filter button: an
 * icon button that opens a panel holding which evaluator to sort by and which
 * way its scores run. The column headings sort the list too, but their arrow
 * is easy to miss and they are gone altogether on a phone, where the table is
 * a list of cards.
 *
 * Unlike the filter beside it there is no Apply: this is a single choice, and
 * the reader wants to see the order change as they make it.
 */
export function TracesSort({
  value,
  evaluators,
  onChange,
}: {
  value: TracesSortValue;
  /** The evaluators that score this agent's traces, in column order. */
  evaluators: { evaluator_uuid: string; name: string }[];
  onChange: (next: TracesSortValue) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useDismissOnOutside(open, rootRef, () => setOpen(false));

  if (evaluators.length === 0) return null;

  const sorted = value.evaluatorUuid !== null;
  const sortedBy = evaluators.find(
    (evaluator) => evaluator.evaluator_uuid === value.evaluatorUuid,
  );

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip
        content={sortedBy ? `Sorted by ${sortedBy.name}` : "Sort traces"}
        position="top"
      >
        <button
          type="button"
          onClick={() => setOpen((wasOpen) => !wasOpen)}
          aria-label="Sort traces"
          aria-expanded={open}
          className={`w-10 h-10 rounded-md border bg-background flex items-center justify-center cursor-pointer transition-colors hover:bg-muted/50 ${
            sorted ? "border-foreground" : "border-border"
          }`}
        >
          <SortIcon className="w-5 h-5" />
        </button>
      </Tooltip>

      {open && (
        // Positioned against the button, the way the filter panel beside it
        // is. Switch to a portal if it ever gets clipped.
        <div className="absolute right-0 top-full mt-2 z-30 w-max min-w-[min(24rem,calc(100vw-2rem))] max-w-[min(38rem,calc(100vw-2rem))] rounded-lg border border-border bg-background shadow-lg p-5">
          <p className="text-sm font-medium text-foreground mb-3">Sort by</p>
          {/* Newest first is what the list does with no evaluator picked, so
              it sits in the same list rather than behind a Clear. */}
          <button
            type="button"
            onClick={() => onChange({ evaluatorUuid: null, order: "asc" })}
            aria-pressed={!sorted}
            className={`w-full text-left px-2 py-2 rounded-md text-sm cursor-pointer transition-colors ${
              sorted
                ? "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                : "bg-muted font-medium text-foreground"
            }`}
          >
            Newest first
          </button>
          {/* Both directions are on screen against every evaluator, so
              "this one, highest first" is one click and never two. */}
          <div className="grid w-full grid-cols-[1fr_max-content] items-center gap-x-4 gap-y-2 mt-2">
            {evaluators.map((evaluator) => {
              const active = value.evaluatorUuid === evaluator.evaluator_uuid;
              return (
                <Fragment key={evaluator.evaluator_uuid}>
                  {/* The row the list is actually sorted by carries an arrow
                      and full-strength text; the rest sit back, so "neither
                      of these is on" reads at a glance. */}
                  <span
                    className={`flex items-center gap-1.5 text-sm whitespace-nowrap px-2 ${
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground"
                    }`}
                  >
                    {evaluator.name}
                  </span>
                  <div className={active ? "" : "opacity-50"}>
                    <SegmentedFilter
                      value={active ? value.order : ""}
                      onChange={(order) => {
                        if (!order) return;
                        onChange({
                          evaluatorUuid: evaluator.evaluator_uuid,
                          order,
                        });
                      }}
                      options={ORDER_OPTIONS}
                      ariaLabel={`Sort traces by ${evaluator.name}`}
                    />
                  </div>
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
