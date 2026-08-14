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

/**
 * The traces list: a table on desktop and cards on mobile. Rows open the
 * detail view.
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
        <table className="w-full table-fixed">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              <th className="w-12 px-4 py-3">
                <SelectCheckbox
                  checked={allSelected}
                  onToggle={onToggleSelectAll}
                  disabled={!hasSelectableItems}
                  label="Select all traces"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-[40%]">
                Input
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                Output
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground w-40">
                Created
              </th>
              <th className="w-14 px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {traces.map((trace) => {
              const outputPreview = traceOutputPreview(trace);
              return (
              <tr
                key={trace.uuid}
                onClick={() => onOpen(trace.uuid)}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <td className="px-4 py-3">
                  <SelectCheckbox {...checkboxProps(trace)} />
                </td>
                <td className="px-4 py-3">
                  {trace.input_preview && (
                    <div className="text-[13px] text-foreground truncate">
                      {trace.input_preview}
                    </div>
                  )}
                  {trace.message_id && (
                    <div className="font-mono text-xs text-muted-foreground truncate mt-0.5">
                      {trace.message_id}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {outputPreview && (
                    <div className="text-[13px] text-foreground truncate">
                      {outputPreview}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-[13px] text-muted-foreground whitespace-nowrap">
                  {formatTraceDate(trace.created_at)}
                </td>
                <td className="px-4 py-3 text-right">
                  <DeleteIconButton
                    onClick={() => onDelete(trace)}
                    title="Delete trace"
                  />
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {traces.map((trace) => {
          const outputPreview = traceOutputPreview(trace);
          return (
          <div
            key={trace.uuid}
            className="border border-border rounded-lg overflow-hidden bg-background"
          >
            <div
              className="p-4 cursor-pointer"
              onClick={() => onOpen(trace.uuid)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  {trace.input_preview && (
                    <p className="text-sm text-foreground line-clamp-2">
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
            </div>
            <div className="flex items-center gap-2 px-4 pb-3 pt-0">
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
