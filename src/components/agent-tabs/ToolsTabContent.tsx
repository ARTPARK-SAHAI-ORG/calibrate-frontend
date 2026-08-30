"use client";

import React, { useState } from "react";
import { AddToolDialog } from "./AddToolDialog";
import { AddToolDialog as EditToolDialog } from "@/components/AddToolDialog";
import { DeleteToolDialog } from "./DeleteToolDialog";
import { InbuiltToolsPanel } from "./InbuiltToolsPanel";
import { CreateToolFlow } from "@/components/tools/CreateToolFlow";
import { attachToolsToAgent } from "@/lib/agentTools";
import { useAccessToken } from "@/hooks/useAccessToken";
import { reportError } from "@/lib/reportError";
import { toast } from "sonner";

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
  const accessToken = useAccessToken();
  // The workspace list, kept up to date here after a tool is written from
  // this tab: the prop is fetched once when the agent page loads and never
  // again, so without this a second Create tool would compare against a list
  // missing the first one and take the wrong tool for the new one.
  const [ownTools, setOwnTools] = useState<ToolData[] | null>(null);
  const workspaceTools = ownTools ?? allTools;
  const [toolsSearchQuery, setToolsSearchQuery] = useState("");
  const [createToolOpen, setCreateToolOpen] = useState(false);
  const [addToolDialogOpen, setAddToolDialogOpen] = useState(false);
  const [deleteToolDialogOpen, setDeleteToolDialogOpen] = useState(false);
  const [toolToDelete, setToolToDelete] = useState<ToolData | null>(null);
  const [editToolUuid, setEditToolUuid] = useState<string | null>(null);
  const [editToolType, setEditToolType] = useState<
    "webhook" | "structured_output"
  >("structured_output");

  const openEditTool = (tool: ToolData) => {
    setEditToolUuid(tool.uuid);
    setEditToolType(
      tool.config?.type === "webhook" ? "webhook" : "structured_output",
    );
  };

  const filteredTools = agentTools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(toolsSearchQuery.toLowerCase()) ||
      ((tool.description || tool.config?.description) &&
        (tool.description || tool.config?.description)
          .toLowerCase()
          .includes(toolsSearchQuery.toLowerCase())),
  );

  // The header's own Add tool / Create tool buttons repeat the empty-state
  // box's buttons below, so they only show once the list actually has
  // something to list — otherwise the placeholder box is the only place
  // those buttons appear.
  const showingList =
    !agentToolsLoading && !agentToolsError && filteredTools.length > 0;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      {showingList && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={() => setAddToolDialogOpen(true)}
              className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              Add tool
            </button>
            <button
              onClick={() => setCreateToolOpen(true)}
              className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Create tool
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4 md:gap-6">
        {/* Left Column - Tools List */}
        <div className="lg:col-span-2 space-y-4 order-2 lg:order-1">
          {/* Search Input */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <svg
                className="w-4 md:w-5 h-4 md:h-5 text-muted-foreground"
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
              className="w-full h-9 md:h-10 pl-9 md:pl-10 pr-4 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
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
            <div className="border border-border rounded-xl p-6 md:p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-12 md:w-14 h-12 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
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
              <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
                No tools found
              </h3>
              <p className="text-sm md:text-base text-muted-foreground mb-3 md:mb-4 text-center">
                {toolsSearchQuery
                  ? "No tools match your search"
                  : "No tools have been added to this agent yet"}
              </p>
              <div className="flex items-center gap-2 md:gap-3">
                {/* Nothing in the workspace to pick from yet, so offering
                    "Add tool" would only open a picker with nothing in it. */}
                {workspaceTools.length > 0 && (
                  <button
                    onClick={() => setAddToolDialogOpen(true)}
                    className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                  >
                    Add tool
                  </button>
                )}
                <button
                  onClick={() => setCreateToolOpen(true)}
                  className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                >
                  Create tool
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-3">
                {agentTools.length} {agentTools.length === 1 ? "tool" : "tools"}
              </p>
              {/* Desktop Table */}
              <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                {/* Table Header */}
                <div className="grid grid-cols-[1fr_150px_1.5fr_auto] gap-4 px-4 py-2 border-b border-border bg-muted/30">
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
                    onClick={() => openEditTool(tool)}
                    className="grid grid-cols-[1fr_150px_1.5fr_auto] gap-4 px-4 py-2 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer"
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
                        {tool.config?.type === "webhook"
                          ? "Webhook"
                          : "Structured Output"}
                      </p>
                    </div>
                    {/* Description Column */}
                    <div className="flex items-center">
                      {tool.description || tool.config?.description ? (
                        <p className="text-sm text-muted-foreground line-clamp-1">
                          {tool.description || tool.config?.description}
                        </p>
                      ) : (
                        <span className="text-sm text-muted-foreground/70">
                          No description
                        </span>
                      )}
                    </div>
                    {/* Delete Button */}
                    <div className="flex items-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
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
              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filteredTools.map((tool) => (
                  <div
                    key={tool.uuid}
                    onClick={() => openEditTool(tool)}
                    className="border border-border rounded-xl p-4 bg-background cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-foreground truncate">
                          {tool.name}
                        </h4>
                        <p className="text-xs text-muted-foreground mt-1">
                          {tool.config?.type === "webhook"
                            ? "Webhook"
                            : "Structured Output"}
                        </p>
                        {(tool.description || tool.config?.description) && (
                          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">
                            {tool.description || tool.config?.description}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setToolToDelete(tool);
                          setDeleteToolDialogOpen(true);
                        }}
                        className="w-8 h-8 flex-shrink-0 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
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
            </>
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
        allTools={workspaceTools}
        allToolsLoading={allToolsLoading}
        onToolsAdded={(tools) => setAgentTools((prev) => [...prev, ...tools])}
      />

      {/* Writing a new tool. A tool written here is for this agent, so it
          goes onto it as well as into the workspace's library. */}
      <CreateToolFlow
        isOpen={createToolOpen}
        onClose={() => setCreateToolOpen(false)}
        accessToken={accessToken ?? undefined}
        knownTools={workspaceTools}
        onCreated={async (tool, updatedTools) => {
          setCreateToolOpen(false);
          setOwnTools(updatedTools);
          try {
            await attachToolsToAgent(
              agentUuid,
              [tool.uuid],
              accessToken ?? undefined,
            );
            setAgentTools((prev) => [...prev, tool]);
          } catch (err) {
            reportError("Error adding the new tool to the agent", err);
            toast.error(
              `"${tool.name}" was created but could not be added to this agent. Add it with Add tool.`,
            );
          }
        }}
      />

      {/* Editing a tool clicked from the list. Same builder the workspace
          Tools page uses; the update lands in the workspace, so reflect it
          back onto this agent's own copy of the tool by uuid. */}
      <EditToolDialog
        isOpen={editToolUuid !== null}
        onClose={() => setEditToolUuid(null)}
        toolType={editToolType}
        editingToolUuid={editToolUuid}
        backendAccessToken={accessToken ?? undefined}
        onToolsUpdated={(updatedTools) => {
          const updated = updatedTools.find((t) => t.uuid === editToolUuid);
          if (!updated) return;
          setAgentTools((prev) =>
            prev.map((t) => (t.uuid === updated.uuid ? updated : t)),
          );
        }}
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
