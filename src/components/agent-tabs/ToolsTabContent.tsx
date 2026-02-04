"use client";

import React, { useState } from "react";
import { AddToolDialog } from "./AddToolDialog";
import { DeleteToolDialog } from "./DeleteToolDialog";
import { InbuiltToolsPanel } from "./InbuiltToolsPanel";

type ToolData = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type ToolsTabContentProps = {
  agentUuid: string;
  agentTools: ToolData[];
  setAgentTools: React.Dispatch<React.SetStateAction<ToolData[]>>;
  agentToolsLoading: boolean;
  agentToolsError: string | null;
  allTools: ToolData[];
  allToolsLoading: boolean;
  endConversationEnabled: boolean;
  setEndConversationEnabled: (value: boolean) => void;
};

export function ToolsTabContent({
  agentUuid,
  agentTools,
  setAgentTools,
  agentToolsLoading,
  agentToolsError,
  allTools,
  allToolsLoading,
  endConversationEnabled,
  setEndConversationEnabled,
}: ToolsTabContentProps) {
  const [toolsSearchQuery, setToolsSearchQuery] = useState("");
  const [addToolDialogOpen, setAddToolDialogOpen] = useState(false);
  const [deleteToolDialogOpen, setDeleteToolDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<ToolData | null>(null);

  const filteredTools = agentTools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(toolsSearchQuery.toLowerCase()) ||
      ((tool.description || tool.config?.description) &&
        (tool.description || tool.config?.description)
          .toLowerCase()
          .includes(toolsSearchQuery.toLowerCase())),
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setAddToolDialogOpen(true)}
          className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
        >
          Add tool
        </button>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left Column - Tools List */}
        <div className="col-span-2 space-y-4">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                className="w-5 h-5 text-muted-foreground"
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
              value={toolsSearchQuery}
              onChange={(e) => setToolsSearchQuery(e.target.value)}
              placeholder="Search tools"
              className="w-full h-10 pl-10 pr-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
            />
          </div>

          {/* Tools List / Loading / Error / Empty State */}
          {agentToolsLoading ? (
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 animate-spin"
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
            </div>
          ) : agentToolsError ? (
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <p className="text-base text-red-500 mb-2">{agentToolsError}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : filteredTools.length === 0 ? (
            <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-14 h-14 rounded-xl bg-muted flex items-center justify-center mb-4">
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
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-1">
                No tools found
              </h3>
              <p className="text-base text-muted-foreground mb-4">
                {toolsSearchQuery
                  ? "No tools match your search"
                  : "No tools have been added to this agent yet"}
              </p>
              <button
                onClick={() => setAddToolDialogOpen(true)}
                className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Add tool
              </button>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden">
              {/* Table Header */}
              <div className="grid grid-cols-[1fr_120px_2fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                <div className="text-sm font-medium text-muted-foreground">
                  Name
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Type
                </div>
                <div className="text-sm font-medium text-muted-foreground">
                  Description
                </div>
                <div className="w-8"></div>
              </div>
              {/* Table Body */}
              {filteredTools.map((tool) => (
                <div
                  key={tool.uuid}
                  className="grid grid-cols-[1fr_120px_2fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors"
                >
                  {/* Name Column */}
                  <div className="flex items-center">
                    <div className="text-sm font-medium text-foreground">
                      {tool.name}
                    </div>
                  </div>
                  {/* Type Column */}
                  <div className="flex items-center">
                    <p className="text-sm text-muted-foreground">
                      {tool.config?.type === "webhook" ? "Webhook" : "Structured Output"}
                    </p>
                  </div>
                  {/* Description Column */}
                  <div className="flex items-center">
                    <p className="text-sm text-muted-foreground line-clamp-1">
                      {tool.description || tool.config?.description || "—"}
                    </p>
                  </div>
                  {/* Delete Button */}
                  <div className="flex items-center">
                    <button
                      onClick={() => {
                        setToolToDelete(tool);
                        setDeleteToolDialogOpen(true);
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Remove tool from agent"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column - In-built Tools */}
        <InbuiltToolsPanel
          endConversationEnabled={endConversationEnabled}
          setEndConversationEnabled={setEndConversationEnabled}
        />
      </div>

      {/* Add Tool Dialog */}
      <AddToolDialog
        isOpen={addToolDialogOpen}
        onClose={() => setAddToolDialogOpen(false)}
        agentUuid={agentUuid}
        agentTools={agentTools}
        allTools={allTools}
        allToolsLoading={allToolsLoading}
        onToolsAdded={(tools) => setAgentTools((prev) => [...prev, ...tools])}
      />

      {/* Delete Tool Confirmation Dialog */}
      <DeleteToolDialog
        isOpen={deleteToolDialogOpen}
        onClose={() => {
          setDeleteToolDialogOpen(false);
          setToolToDelete(null);
        }}
        agentUuid={agentUuid}
        tool={toolToDelete}
        onToolDeleted={(toolUuid) =>
          setAgentTools((prev) => prev.filter((t) => t.uuid !== toolUuid))
        }
      />
    </div>
  );
}
