"use client";

import React, { useState } from "react";
import { ToolPreview } from "./ToolPreview";
import type { ToolData } from "@/components/AddToolDialog";

type ToolLibraryPickerProps = {
  /** Already filtered by the caller (e.g. library minus already-added). */
  tools: ToolData[];
  selectedIds: Set<string>;
  onToggle: (uuid: string) => void;
  isLoading?: boolean;
  /** Shown when `tools` is empty (nothing left to add at all). */
  emptyMessage?: string;
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
}: ToolLibraryPickerProps) {
  const [search, setSearch] = useState("");
  const [previewUuid, setPreviewUuid] = useState<string | null>(null);

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
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <p className="text-base text-muted-foreground">{emptyMessage}</p>
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
              const checked = selectedIds.has(tool.uuid);
              const type =
                tool.config?.type === "webhook"
                  ? "Webhook"
                  : "Structured Output";
              const description =
                tool.description || tool.config?.description || "";
              return (
                <div
                  key={tool.uuid}
                  className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
                    previewUuid === tool.uuid
                      ? "bg-muted/60 border-l-2 border-foreground/40 pl-[calc(0.75rem-2px)]"
                      : "hover:bg-muted/30"
                  }`}
                >
                  <span className="flex h-5 items-center flex-shrink-0">
                    <input
                      type="checkbox"
                      aria-label={`Select ${tool.name}`}
                      checked={checked}
                      onChange={() => onToggle(tool.uuid)}
                      className="w-4 h-4 cursor-pointer accent-foreground"
                    />
                  </span>
                  {/* The body opens the preview on the right rather than
                      ticking the box, so a tool can be read before it is
                      added. */}
                  <button
                    type="button"
                    onClick={() => setPreviewUuid(tool.uuid)}
                    className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border rounded-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {tool.name}
                      </span>
                      <span className="text-xs text-muted-foreground flex-shrink-0">
                        {type}
                      </span>
                    </div>
                    {description && (
                      <div className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
                        {description}
                      </div>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* What the picked tool needs to be called. Below the list on a
          phone, where two columns will not fit. */}
      <div className="md:flex-1 md:min-w-0 border border-border rounded-md overflow-hidden max-h-[60vh] md:max-h-none md:h-full md:min-h-0">
        <ToolPreview tool={previewTool} />
      </div>
    </div>
  );
}
