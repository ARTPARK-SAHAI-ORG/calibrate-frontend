"use client";

import React from "react";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";
import { DeleteIconButton } from "@/components/ui";
import type { TraceSummary } from "@/lib/tracesApi";

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

const ROW_GRID =
  "grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_160px_auto] gap-4 px-4 py-2";

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
        <div className={`${ROW_GRID} border-b border-border bg-muted/30 items-center`}>
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
          const outputPreview = traceOutputPreview(trace);
          return (
            <div
              key={trace.uuid}
              onClick={() => onOpen(trace.uuid)}
              className={`${ROW_GRID} border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center`}
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
                {trace.message_id && (
                  <div className="font-mono text-xs text-muted-foreground truncate mt-0.5">
                    {trace.message_id}
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {outputPreview && (
                  <div className="text-sm text-foreground truncate">
                    {outputPreview}
                  </div>
                )}
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
          const outputPreview = traceOutputPreview(trace);
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
                {trace.message_id && (
                  <div className="font-mono text-xs text-muted-foreground truncate mt-0.5">
                    {trace.message_id}
                  </div>
                )}
              </div>
              <SelectCheckbox {...checkboxProps(trace)} />
            </div>
            {outputPreview && (
              <p className="text-sm text-foreground mt-1 line-clamp-2">
                {outputPreview}
              </p>
            )}
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
