"use client";

import React from "react";
import { ToolIcon } from "@/components/icons";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";
import { DeleteIconButton } from "@/components/ui";
import type { TraceSummary, TraceToolCall } from "@/lib/tracesApi";

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
};

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

const ROW_GRID =
  "grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_160px_auto] gap-4 px-4";

/**
 * The traces list: a table on desktop and cards on mobile. Rows open the
 * detail view. Desktop markup matches the other resource lists (CSS grid,
 * not an HTML table).
 */
export function TracesTable({
  traces,
  checkboxProps,
  allSelected,
  hasSelectableItems,
  onToggleSelectAll,
  onOpen,
  onDelete,
}: TracesTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <div className={`${ROW_GRID} py-2 border-b border-border bg-muted/30 items-center`}>
          <div className="flex items-center">
            <SelectCheckbox
              checked={allSelected}
              onToggle={onToggleSelectAll}
              disabled={!hasSelectableItems}
              label="Select all traces"
            />
          </div>
          <div className="text-sm font-medium text-muted-foreground">Input</div>
          <div className="text-sm font-medium text-muted-foreground">Output</div>
          <div className="text-sm font-medium text-muted-foreground">Created</div>
          <div className="w-8" />
        </div>
        {traces.map((trace) => {
          return (
            <div
              key={trace.uuid}
              onClick={() => onOpen(trace.uuid)}
              className={`${ROW_GRID} py-2.5 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center`}
            >
              <div className="flex items-center">
                <SelectCheckbox {...checkboxProps(trace)} />
              </div>
              <div className="min-w-0">
                {trace.input_preview && (
                  <div className="text-sm font-medium text-foreground truncate">
                    {trace.input_preview}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <TraceOutputCell trace={trace} />
              </div>
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
              <div className="min-w-0">
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
