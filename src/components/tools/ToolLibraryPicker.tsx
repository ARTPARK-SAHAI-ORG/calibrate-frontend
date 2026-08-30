"use client";

import React, { useEffect, useState } from "react";
import { ToolPreview } from "./ToolPreview";
import { PickerRow } from "@/components/ui/PickerRow";
import { EmptyState } from "@/components/ui";
import { ToolTypePill } from "./ToolTypePill";
import type { ToolData } from "@/components/AddToolDialog";

type ToolLibraryPickerProps = {
  /** Already filtered by the caller (e.g. library minus already-added). */
  tools: ToolData[];
  selectedIds: Set<string>;
  onToggle: (uuid: string) => void;
  isLoading?: boolean;
  /** Shown when `tools` is empty (nothing left to add at all). */
  emptyMessage?: string;
  /**
   * Offered under `emptyMessage` when there is nothing left to pick, so the
   * reader can make one instead of leaving empty-handed.
   */
  emptyAction?: React.ReactNode;
  /**
   * Show this tool's detail on the right, as if its row had been clicked.
   * Set it after creating one, so the reader sees what they just made.
   */
  previewUuid?: string | null;
  /** Opens the tool builder in edit mode for the previewed tool. */
  onEditTool?: (tool: ToolData) => void;
  /** Permanently deletes the previewed tool from the workspace. */
  onDeleteTool?: (tool: ToolData) => void;
};

/**
 * The searchable tool checkbox list with a preview of the selected tool on
 * the right, the same layout EvaluatorPicker uses. Presentational: the
 * caller owns the selection and the surrounding dialog chrome.
 */
export function ToolLibraryPicker({
  tools,
  selectedIds,
  onToggle,
  isLoading = false,
  emptyMessage = "No tools available",
  emptyAction,
  previewUuid: previewUuidProp,
  onEditTool,
  onDeleteTool,
}: ToolLibraryPickerProps) {
  const [search, setSearch] = useState("");
  // Nothing picked yet, which is not the same as nothing to show: until the
  // reader clicks a row (or the parent names one), the first tool is the one
  // on the right. Worked out on every render rather than once at the start,
  // so a list that arrives after this opens still gets a preview.
  const [pickedUuid, setPickedUuid] = useState<string | null>(null);
  // A parent that names a tool (one just created) opens it on the right.
  // Clicking another row afterwards still wins, until the parent names a new one.
  useEffect(() => {
    if (previewUuidProp) setPickedUuid(previewUuidProp);
  }, [previewUuidProp]);
  // The first tool stands in until a row is clicked, and again if the tool
  // that was on show is deleted from here.
  const previewUuid =
    (pickedUuid && tools.some((t) => t.uuid === pickedUuid)
      ? pickedUuid
      : tools[0]?.uuid) ?? null;

  const q = search.trim().toLowerCase();
  const filteredTools = tools.filter((tool) => {
    if (!q) return true;
    const description = tool.description || tool.config?.description || "";
    return (
      tool.name.toLowerCase().includes(q) ||
      description.toLowerCase().includes(q)
    );
  });
  const previewTool = tools.find((t) => t.uuid === previewUuid) ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <svg
          className="w-5 h-5 animate-spin text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      </div>
    );
  }

  if (tools.length === 0) {
    return (
      <EmptyState
        className="md:h-full"
        icon={
          <svg
            className="w-7 h-7 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
            />
          </svg>
        }
        title="No tools to add"
        description={emptyMessage}
        actions={emptyAction}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row gap-3 md:gap-4 md:h-full md:min-h-0">
      <div className="space-y-3 md:flex-1 md:min-w-0 md:flex md:flex-col md:min-h-0">
        {/* Search */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
            <svg
              className="w-4 h-4 text-muted-foreground"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
              />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tools"
            className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
          />
        </div>

        {/* Checkbox list */}
        {/* No line between rows: the evaluator picker's list has none either,
            and the two are meant to read as one screen. */}
        <div className="border border-border rounded-md overflow-y-auto md:flex-1 md:min-h-0 max-h-96 md:max-h-none">
          {filteredTools.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No tools match your search
            </div>
          ) : (
            filteredTools.map((tool) => {
              const description =
                tool.description || tool.config?.description || "";
              return (
                <PickerRow
                  key={tool.uuid}
                  ariaLabel={`Select ${tool.name}`}
                  checked={selectedIds.has(tool.uuid)}
                  onToggle={() => onToggle(tool.uuid)}
                  isPreviewed={previewUuid === tool.uuid}
                  onPreview={() => setPickedUuid(tool.uuid)}
                  name={tool.name}
                  description={description}
                  badge={<ToolTypePill configType={tool.config?.type} />}
                />
              );
            })
          )}
        </div>
      </div>

      {/* What the picked tool needs to be called. Below the list on a
          phone, where two columns will not fit. */}
      <div className="md:flex-1 md:min-w-0 border border-border rounded-md overflow-hidden max-h-[60vh] md:max-h-none md:h-full md:min-h-0">
        <ToolPreview
          tool={previewTool}
          onEdit={onEditTool}
          onDelete={onDeleteTool}
        />
      </div>
    </div>
  );
}
