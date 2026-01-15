"use client";

import React, { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";

type ToolData = {
  uuid: string;
  name: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
};

type DeleteToolDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  tool: ToolData | null;
  onToolDeleted: (toolUuid: string) => void;
};

export function DeleteToolDialog({
  isOpen,
  onClose,
  agentUuid,
  tool,
  onToolDeleted,
}: DeleteToolDialogProps) {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [isDeleting, setIsDeleting] = useState(false);

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  const handleDelete = async () => {
    if (!tool) return;

    try {
      setIsDeleting(true);
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        throw new Error("BACKEND_URL environment variable is not set");
      }

      const response = await fetch(`${backendUrl}/agent-tools`, {
        method: "DELETE",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          agent_uuid: agentUuid,
          tool_uuid: tool.uuid,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to remove tool from agent");
      }

      onToolDeleted(tool.uuid);
      onClose();
    } catch (err) {
      console.error("Error removing tool from agent:", err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <DeleteConfirmationDialog
      isOpen={isOpen && !!tool}
      onClose={handleClose}
      onConfirm={handleDelete}
      title="Remove tool"
      message={`Are you sure you want to remove "${tool?.name}" from this agent?`}
      confirmText="Remove"
      isDeleting={isDeleting}
    />
  );
}
