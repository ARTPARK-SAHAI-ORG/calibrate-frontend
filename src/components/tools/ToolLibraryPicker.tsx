"use client";

import React, { useEffect, useState } from "react";
import { ToolPreview } from "./ToolPreview";
import { PickerRow } from "@/components/ui/PickerRow";
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
  // Preview the first tool as soon as the list has something to show, so the
  // right column is never empty on open. Only the initial value — the reader
  // picking a different row from then on is what drives it, not search.
  const [previewUuid, setPreviewUuid] = useState<string | null>(
    () => tools[0]?.uuid ?? null,
  );
  // A parent that names a tool (one just created) opens it on the right.
  // Clicking another row afterwards still wins, until the parent names a new one.
  useEffect(() => {
    if (previewUuidProp) setPreviewUuid(previewUuidProp);
  }, [previewUuidProp]);

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
      <div className="flex flex-col items-center justify-center gap-4 py-8 text-center">
        <p className="text-base text-muted-foreground">{emptyMessage}</p>
        {emptyAction}
      </div>
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
        <div className="border border-border rounded-md overflow-y-auto divide-y divide-border md:flex-1 md:min-h-0 max-h-96 md:max-h-none">
          {filteredTools.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              No tools match your search
            </div>
          ) : (
            filteredTools.map((tool) => {
              const type =
                tool.config?.type === "webhook"
                  ? "Webhook"
                  : "Structured Output";
              const description =
                tool.description || tool.config?.description || "";
              return (
                <PickerRow
                  key={tool.uuid}
                  ariaLabel={`Select ${tool.name}`}
                  checked={selectedIds.has(tool.uuid)}
                  onToggle={() => onToggle(tool.uuid)}
                  isPreviewed={previewUuid === tool.uuid}
                  onPreview={() => setPreviewUuid(tool.uuid)}
                  name={tool.name}
                  description={description}
                  badge={
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
                      {type}
                    </span>
                  }
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
