"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";

type ToolData = {
  uuid: string;
  name: string;
  description?: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type AddToolDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentTools: ToolData[];
  allTools: ToolData[];
  allToolsLoading: boolean;
  onToolsAdded: (tools: ToolData[]) => void;
};

export function AddToolDialog({
  isOpen,
  onClose,
  agentUuid,
  agentTools,
  allTools,
  allToolsLoading,
  onToolsAdded,
}: AddToolDialogProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleClose = () => {
    setSearchQuery("");
    setSelectedTools(new Set());
    onClose();
  };

  const handleAdd = async () => {
    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const toolUuidsToAdd = Array.from(selectedTools);

      const response = await fetch(`${backendUrl}/agent-tools`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          agent_uuid: agentUuid,
          tool_uuids: toolUuidsToAdd,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to add tools to agent");
      }

      // Get added tools data
      const addedTools = allTools.filter((tool) =>
        toolUuidsToAdd.includes(tool.uuid)
      );
      onToolsAdded(addedTools);

      // Close dialog and reset state
      handleClose();
    } catch (err) {
      console.error("Error adding tools to agent:", err);
    }
  };

  // Filter out tools already added to the agent
  const agentToolUuids = new Set(agentTools.map((t) => t.uuid));
  const baseAvailableTools = allTools.filter(
    (tool) => !agentToolUuids.has(tool.uuid)
  );

  // Filter by search query
  const availableTools = baseAvailableTools.filter(
    (tool) =>
      tool.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      ((tool.description || tool.config?.description) &&
        (tool.description || tool.config?.description)
          .toLowerCase()
          .includes(searchQuery.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl w-[40%] min-w-[500px] max-h-[80vh] flex flex-col shadow-2xl">
        {/* Dialog Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold">Add Tools</h2>
          <button
            onClick={handleClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Tools List */}
        <div className="flex-1 overflow-y-auto p-4">
          {allToolsLoading ? (
            <div className="flex items-center justify-center py-8">
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
          ) : baseAvailableTools.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <p className="text-base text-muted-foreground">
                All available tools have been added to this agent
              </p>
            </div>
          ) : (
            <>
              {/* Search Input */}
              <div className="mb-4">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tools"
                  className="w-full h-10 px-4 rounded-md text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {availableTools.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <p className="text-base text-muted-foreground">
                    No tools match your search
                  </p>
                </div>
              ) : (
                availableTools.map((tool) => {
                  const isSelected = selectedTools.has(tool.uuid);
                  return (
                    <button
                      key={tool.uuid}
                      onClick={() => {
                        setSelectedTools((prev) => {
                          const newSet = new Set(prev);
                          if (newSet.has(tool.uuid)) {
                            newSet.delete(tool.uuid);
                          } else {
                            newSet.add(tool.uuid);
                          }
                          return newSet;
                        });
                      }}
                      className={`w-full p-4 rounded-lg border transition-colors cursor-pointer text-left mb-3 last:mb-0 ${
                        isSelected
                          ? "border-foreground bg-muted/50"
                          : "border-border bg-muted/30 hover:bg-muted/50"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Checkbox */}
                        <div
                          className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center mt-0.5 transition-colors ${
                            isSelected
                              ? "bg-foreground border-foreground"
                              : "border-border"
                          }`}
                        >
                          {isSelected && (
                            <svg
                              className="w-3 h-3 text-background"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={3}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M4.5 12.75l6 6 9-13.5"
                              />
                            </svg>
                          )}
                        </div>
                        <div>
                          <h4 className="text-base font-medium text-foreground">
                            {tool.name}
                          </h4>
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                            {tool.description || tool.config?.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </>
          )}
        </div>

        {/* Footer - only shown when tools are selected */}
        {selectedTools.size > 0 && (
          <div className="px-4 py-3 border-t border-border flex items-center justify-end">
            <button
              onClick={handleAdd}
              className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
            >
              Add ({selectedTools.size})
            </button>
          </div>
        )}
      </div>

      {/* Backdrop click to close */}
      <div className="absolute inset-0 -z-10" onClick={handleClose} />
    </div>
  );
}
