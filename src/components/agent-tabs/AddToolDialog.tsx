"use client";
import { reportError } from "@/lib/reportError";

import React, { useState } from "react";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { useHideFloatingButton } from "@/components/AppLayout";
import { ToolLibraryPicker } from "@/components/tools/ToolLibraryPicker";
import { CreateToolFlow } from "@/components/tools/CreateToolFlow";
import { AddToolDialog as EditToolDialog } from "@/components/AddToolDialog";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { deleteTool } from "@/lib/toolsApi";
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
  // Seeded from the prop, then kept up to date locally when a tool is made
  // from inside this dialog — the workspace-wide list the parent fetched
  // won't itself refresh until the next full load. Resets fresh on every
  // open, since the dialog fully unmounts on close.
  const [localAllTools, setLocalAllTools] = useState<ToolData[]>(allTools);
  const [createToolOpen, setCreateToolOpen] = useState(false);
  const [previewUuid, setPreviewUuid] = useState<string | null>(null);
  // Editing the previewed tool, from its own edit/delete buttons.
  const [editToolUuid, setEditToolUuid] = useState<string | null>(null);
  const [editToolType, setEditToolType] = useState<
    "webhook" | "structured_output"
  >("structured_output");
  const [deleteTarget, setDeleteTarget] = useState<ToolData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleClose = () => {
    setSelectedTools(new Set());
    onClose();
  };

  const openEditTool = (tool: ToolData) => {
    setEditToolUuid(tool.uuid);
    setEditToolType(tool.config?.type === "webhook" ? "webhook" : "structured_output");
  };

  const confirmDeleteTool = async () => {
    if (!deleteTarget || !backendAccessToken) return;
    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteTool(deleteTarget.uuid, backendAccessToken);
      setLocalAllTools((prev) => prev.filter((t) => t.uuid !== deleteTarget.uuid));
      setSelectedTools((prev) => {
        const next = new Set(prev);
        next.delete(deleteTarget.uuid);
        return next;
      });
      setDeleteTarget(null);
    } catch (err) {
      reportError("Error deleting tool:", err);
      setDeleteError(
        err instanceof Error ? err.message : "Failed to delete tool",
      );
    } finally {
      setIsDeleting(false);
    }
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
      const addedTools = localAllTools.filter((tool) =>
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
  const baseAvailableTools = localAllTools.filter(
    (tool) => !agentToolUuids.has(tool.uuid)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] md:h-[85vh]"
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
            emptyAction={
              <button
                type="button"
                onClick={() => setCreateToolOpen(true)}
                className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
              >
                Create tool
              </button>
            }
            previewUuid={previewUuid}
            onEditTool={openEditTool}
            onDeleteTool={setDeleteTarget}
          />
        </div>

        {/* Making a tool from inside this dialog, when there is nothing
            left to pick. It comes back here with the new tool selected and
            previewed, ready to be added along with anything else picked. */}
        <CreateToolFlow
          isOpen={createToolOpen}
          onClose={() => setCreateToolOpen(false)}
          accessToken={backendAccessToken ?? undefined}
          knownTools={localAllTools}
          onCreated={(tool, updatedTools) => {
            setCreateToolOpen(false);
            setLocalAllTools(updatedTools);
            setSelectedTools((prev) => new Set(prev).add(tool.uuid));
            setPreviewUuid(tool.uuid);
          }}
        />

        {/* Editing a tool from its own preview panel. Same builder the
            workspace Tools page uses; the update comes back to this same
            dialog with fresh data by uuid. */}
        <EditToolDialog
          isOpen={editToolUuid !== null}
          onClose={() => setEditToolUuid(null)}
          toolType={editToolType}
          editingToolUuid={editToolUuid}
          backendAccessToken={backendAccessToken ?? undefined}
          onToolsUpdated={(updatedTools) => {
            const updated = updatedTools.find((t) => t.uuid === editToolUuid);
            if (!updated) return;
            setLocalAllTools((prev) =>
              prev.map((t) => (t.uuid === updated.uuid ? updated : t)),
            );
          }}
        />

        {/* Deleting a tool from its own preview panel — permanent, from the
            whole workspace, not just this agent. */}
        <DeleteConfirmationDialog
          isOpen={deleteTarget !== null}
          onClose={() => {
            setDeleteTarget(null);
            setDeleteError(null);
          }}
          onConfirm={confirmDeleteTool}
          title="Delete tool"
          message={`Are you sure you want to permanently delete "${deleteTarget?.name}"? This removes it from the whole workspace, not just this agent.`}
          confirmText="Delete"
          isDeleting={isDeleting}
          extraContent={
            deleteError && (
              <p role="alert" className="text-sm text-red-500">
                {deleteError}
              </p>
            )
          }
        />

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
