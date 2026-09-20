"use client";

import React from "react";
import { ToolIcon } from "@/components/icons";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";
import { DeleteIconButton } from "@/components/ui";
import type {
  TraceSortOrder,
  TraceSummary,
  TraceToolCall,
} from "@/lib/tracesApi";
import {
  TraceScoreCells,
  TraceScoreMark,
  type TraceScoreColumn,
} from "./TraceScoringSummary";

type CheckboxProps = {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
  tooltip?: string;
};

type TracesTableProps = {
  traces: TraceSummary[];
  /** Per-row selection checkbox props, from `useTraceDeletion`. */
  checkboxProps: (trace: TraceSummary) => CheckboxProps;
  allSelected: boolean;
  hasSelectableItems: boolean;
  onToggleSelectAll: () => void;
  /** Open the detail view for a trace. */
  onOpen: (traceUuid: string) => void;
  /** Ask to delete a single trace. */
  onDelete: (trace: TraceSummary) => void;
  /** One column per evaluator that scores this agent's traces. None hides
   *  the score columns altogether. */
  scoreColumns?: TraceScoreColumn[];
  /** The evaluator the list is ordered by, if any. */
  sortByEvaluator?: string | null;
  /** Which way that order runs. */
  sortOrder?: TraceSortOrder;
  /** Order the list by this evaluator's scores. Leaving it out keeps the
   *  evaluator headings as plain text. */
  onSortByEvaluator?: (evaluatorUuid: string) => void;
};

/** The heading of one evaluator column, which orders the list when clicked.
 *  The arrow shows on the column the list is ordered by and points the way
 *  that order runs. */
function ScoreColumnHeading({
  column,
  sortByEvaluator,
  sortOrder,
  onSortByEvaluator,
}: {
  column: TraceScoreColumn;
  sortByEvaluator?: string | null;
  sortOrder?: TraceSortOrder;
  onSortByEvaluator?: (evaluatorUuid: string) => void;
}) {
  const headingClass =
    "text-sm font-medium text-muted-foreground whitespace-nowrap";
  const isSorted = sortByEvaluator === column.evaluator_uuid;
  if (!onSortByEvaluator)
    return <div className={headingClass}>{column.name}</div>;
  return (
    <button
      type="button"
      onClick={() => onSortByEvaluator(column.evaluator_uuid)}
      aria-label={
        isSorted
          ? `Sort traces by ${column.name}, ordered ${
              sortOrder === "asc" ? "lowest first" : "highest first"
            }`
          : `Sort traces by ${column.name}`
      }
      className={`${headingClass} flex items-center gap-1 text-left hover:text-foreground transition-colors cursor-pointer`}
    >
      <span className="truncate">{column.name}</span>
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        className={`w-3.5 h-3.5 flex-shrink-0 ${
          isSorted ? "text-foreground" : "opacity-30"
        } ${isSorted && sortOrder === "asc" ? "rotate-180" : ""}`}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

export function formatTraceDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Compact `key: value` line for a tool's arguments. */
export function formatToolArgs(
  args?: Record<string, unknown> | null,
): string | null {
  if (!args || typeof args !== "object" || Array.isArray(args)) return null;
  const parts = Object.entries(args).map(([key, value]) => {
    let display: string;
    if (value === null || value === undefined) display = "null";
    else if (typeof value === "string") display = value;
    else {
      try {
        display = JSON.stringify(value);
      } catch {
        display = String(value);
      }
    }
    return `${key}: ${display}`;
  });
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** Text reply, else the tool names, so the Output column is never a placeholder. */
export function traceOutputPreview(trace: {
  response_preview: string | null;
  tool_names?: string[] | null;
}): string | null {
  const reply = trace.response_preview?.trim();
  if (reply) return reply;
  const names = (trace.tool_names ?? [])
    .map((name) => name.trim())
    .filter(Boolean);
  return names.length > 0 ? names.join(", ") : null;
}

function ToolCallPreview({ call }: { call: TraceToolCall }) {
  const argsLine = formatToolArgs(call.arguments);
  return (
    <div className="min-w-0 rounded-md bg-muted/50 px-2 py-1">
      <div className="flex items-center gap-1.5 min-w-0">
        <ToolIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="text-xs font-medium font-mono text-foreground truncate">
          {call.tool}
        </span>
      </div>
      {argsLine && (
        <p
          className="text-xs text-muted-foreground truncate mt-0.5 pl-5"
          title={argsLine}
        >
          {argsLine}
        </p>
      )}
    </div>
  );
}

function TraceOutputCell({ trace }: { trace: TraceSummary }) {
  const reply = trace.response_preview?.trim();
  if (reply) {
    return (
      <div className="text-sm text-foreground truncate" title={reply}>
        {reply}
      </div>
    );
  }
  const calls = (trace.tool_calls ?? []).filter((call) => call.tool?.trim());
  if (calls.length > 0) {
    return (
      <div className="space-y-1 min-w-0">
        {calls.map((call, index) => (
          <ToolCallPreview key={`${call.tool}-${index}`} call={call} />
        ))}
      </div>
    );
  }
  const names = traceOutputPreview(trace);
  if (!names) return null;
  return (
    <div className="text-sm text-foreground truncate" title={names}>
      {names}
    </div>
  );
}

/**
 * The traces list: a table on desktop and cards on mobile. Rows open the
 * detail view. Desktop markup matches the other resource lists (CSS grid,
 * not an HTML table).
 */
// Tailwind only compiles class names it can read in the source, so the column
// widths are an inline style; everything fixed stays a class.
const ROW_CLASS = "grid gap-4 px-4 min-w-max";

export function TracesTable({
  traces,
  checkboxProps,
  allSelected,
  hasSelectableItems,
  onToggleSelectAll,
  onOpen,
  onDelete,
  scoreColumns = [],
  sortByEvaluator = null,
  sortOrder = "desc",
  onSortByEvaluator,
}: TracesTableProps) {
  // Each evaluator column is as wide as its own name plus the arrow that
  // orders it, in the same template for every row, so nothing is cut and the
  // columns still line up.
  const evaluatorTracks = scoreColumns
    .map((column) => `${Math.max(10, column.name.length + 3)}ch`)
    .join(" ");
  const ROW_STYLE = {
    // Every track is a fixed width, because each row is its own grid: a track
    // sized to its content would come out different on every row and the
    // columns would not line up. The table scrolls sideways instead.
    gridTemplateColumns: `40px 400px 400px${
      evaluatorTracks ? ` ${evaluatorTracks}` : ""
    } 160px auto`,
  };
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-x-auto">
        <div
          style={ROW_STYLE}
          className={`${ROW_CLASS} py-2 border-b border-border bg-muted/30 items-center`}
        >
          <div className="flex items-center">
            <SelectCheckbox
              checked={allSelected}
              onToggle={onToggleSelectAll}
              disabled={!hasSelectableItems}
              label="Select all traces"
            />
          </div>
          <div className="text-sm font-medium text-muted-foreground">Input</div>
          <div className="text-sm font-medium text-muted-foreground">
            Output
          </div>
          {scoreColumns.map((column) => (
            <ScoreColumnHeading
              key={column.evaluator_uuid}
              column={column}
              sortByEvaluator={sortByEvaluator}
              sortOrder={sortOrder}
              onSortByEvaluator={onSortByEvaluator}
            />
          ))}
          <div className="text-sm font-medium text-muted-foreground">
            Created
          </div>
          <div className="w-8" />
        </div>
        {traces.map((trace) => {
          return (
            <div
              key={trace.uuid}
              onClick={() => onOpen(trace.uuid)}
              style={ROW_STYLE}
              className={`${ROW_CLASS} py-2.5 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center`}
            >
              <div className="flex items-center">
                <SelectCheckbox {...checkboxProps(trace)} />
              </div>
              <div className="min-w-0 flex items-center gap-2">
                <TraceScoreMark trace={trace} />
                {trace.input_preview && (
                  <div className="text-sm font-medium text-foreground truncate">
                    {trace.input_preview}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <TraceOutputCell trace={trace} />
              </div>
              <TraceScoreCells
                trace={trace}
                columns={scoreColumns}
                layout="row"
              />
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                {formatTraceDate(trace.created_at)}
              </div>
              <div className="flex items-center">
                <DeleteIconButton
                  onClick={() => onDelete(trace)}
                  title="Delete trace"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {traces.map((trace) => {
          return (
            <div
              key={trace.uuid}
              onClick={() => onOpen(trace.uuid)}
              className="border border-border rounded-xl p-3 bg-background hover:bg-muted/20 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex items-start gap-2">
                  <TraceScoreMark trace={trace} />
                  {trace.input_preview && (
                    <p className="text-sm font-medium text-foreground line-clamp-2">
                      {trace.input_preview}
                    </p>
                  )}
                </div>
                <SelectCheckbox {...checkboxProps(trace)} />
              </div>
              <div className="mt-2">
                <TraceOutputCell trace={trace} />
              </div>
              <TraceScoreCells
                trace={trace}
                columns={scoreColumns}
                layout="card"
              />
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-muted-foreground">
                  {formatTraceDate(trace.created_at)}
                </span>
                <div className="ml-auto">
                  <DeleteIconButton
                    onClick={() => onDelete(trace)}
                    title="Delete trace"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
