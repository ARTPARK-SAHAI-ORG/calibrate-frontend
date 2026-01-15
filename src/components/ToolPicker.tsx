"use client";

import { useState } from "react";
import { INBUILT_TOOLS, getInbuiltToolIcon } from "@/constants/inbuilt-tools";

export type AvailableTool = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ToolPickerProps = {
  availableTools: AvailableTool[];
  isLoading: boolean;
  onSelectInbuiltTool: (toolId: string, toolName: string) => void;
  onSelectCustomTool: (
    tool: AvailableTool,
    params: Array<{ name: string; value: string }>
  ) => void;
  selectedToolIds?: string[];
};

// Helper function to get tool parameters
export const getToolParams = (
  tool: AvailableTool
): Array<{ name: string; value: string }> => {
  // Check for array format first (new format)
  const params = tool.config?.parameters;
  if (Array.isArray(params)) {
    return params.map((param: any) => ({
      name: param.id || param.name || "",
      value: "",
    }));
  }

  // Fallback to object format (legacy)
  const props =
    tool.config?.parameters?.properties ||
    tool.config?.function?.parameters?.properties ||
    tool.config?.properties ||
    tool.config?.parameters ||
    {};
  return Object.keys(props).map((key) => ({ name: key, value: "" }));
};

export function ToolPicker({
  availableTools,
  isLoading,
  onSelectInbuiltTool,
  onSelectCustomTool,
  selectedToolIds = [],
}: ToolPickerProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter tools based on search query and exclude already selected tools
  const filteredTools = availableTools.filter(
    (tool) =>
      !selectedToolIds.includes(tool.uuid) &&
      (tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ((tool.description || tool.config?.description) &&
          (tool.description || tool.config?.description)
            .toLowerCase()
            .includes(searchQuery.toLowerCase())))
  );

  const filteredInbuiltTools = INBUILT_TOOLS.filter(
    (tool) =>
      !selectedToolIds.includes(tool.id) &&
      tool.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <>
      {/* Search Input */}
      <div className="p-3 border-b border-border">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search tools"
          className="w-full h-9 px-3 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-1 focus:ring-border"
          autoFocus
        />
      </div>

      {/* Tools List */}
      <div className="max-h-[250px] overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
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
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
          </div>
        ) : (
          <>
            {/* In-built tools section */}
            {filteredInbuiltTools.length > 0 && (
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                In-built tools
              </div>
            )}
            {filteredInbuiltTools.map((tool) => (
              <button
                key={tool.id}
                onClick={() => onSelectInbuiltTool(tool.id, tool.name)}
                className="w-full px-3 py-2.5 flex items-center gap-3 text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-b-0"
              >
                <svg
                  className="w-4 h-4 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d={getInbuiltToolIcon(tool.icon)}
                  />
                </svg>
                <p className="text-sm font-medium text-left">{tool.name}</p>
              </button>
            ))}

            {/* Custom tools section */}
            {filteredTools.length > 0 && (
              <div className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b border-border">
                User defined tools
              </div>
            )}
            {filteredTools.map((tool) => {
              const params = getToolParams(tool);
              return (
                <button
                  key={tool.uuid}
                  onClick={() => onSelectCustomTool(tool, params)}
                  className="w-full px-3 py-2.5 flex items-center gap-3 text-foreground hover:bg-muted transition-colors cursor-pointer border-b border-border last:border-b-0"
                >
                  <svg
                    className="w-4 h-4 text-muted-foreground"
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
                  <p className="text-sm font-medium text-left">{tool.name}</p>
                </button>
              );
            })}

            {/* Empty state */}
            {filteredTools.length === 0 &&
              filteredInbuiltTools.length === 0 && (
                <div className="py-6 text-center text-muted-foreground text-sm">
                  {searchQuery
                    ? "No tools match your search"
                    : "No tools available"}
                </div>
              )}
          </>
        )}
      </div>
    </>
  );
}
