"use client";
import { reportError } from "@/lib/reportError";

import React, { useState } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { useHideFloatingButton } from "@/components/AppLayout";
import { ToolLibraryPicker } from "@/components/tools/ToolLibraryPicker";
import type { ToolData } from "@/components/AddToolDialog";

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
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const backendAccessToken = useAccessToken();
  const [selectedTools, setSelectedTools] = useState<Set<string>>(new Set());

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedTools(new Set());
    onClose();
  };

  const toggleTool = (uuid: string) => {
    setSelectedTools((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
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
      reportError("Error adding tools to agent:", err);
    }
  };

  // Filter out tools already added to the agent
  const agentToolUuids = new Set(agentTools.map((t) => t.uuid));
  const baseAvailableTools = allTools.filter(
    (tool) => !agentToolUuids.has(tool.uuid)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[85vh] md:h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
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

        {/* Tools List + Preview */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-4">
          <ToolLibraryPicker
            tools={baseAvailableTools}
            selectedIds={selectedTools}
            onToggle={toggleTool}
            isLoading={allToolsLoading}
            emptyMessage="All available tools have been added to this agent"
          />
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
    </div>
  );
}
