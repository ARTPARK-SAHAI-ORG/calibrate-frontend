"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";

type AgentLike = { uuid: string; name: string };

type UseAgentDeletionArgs<T extends AgentLike> = {
  /** The currently visible (sorted/filtered) agents — drives the "select all"
   *  toggle. */
  agents: T[];
  /** Prune the given uuids from the page's agent list after a successful
   *  delete. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the delete requests. */
  accessToken: string | null;
};

/**
 * Shared selection + delete logic for the agents list. Manages row selection
 * (single + select-all), the single/bulk delete dialog state, and the delete
 * calls against the agents API. Every agent is eligible for bulk deletion (no
 * status gating, unlike jobs), so selection is unconditional.
 *
 * Delete routing:
 * - Bulk selection → `POST /agents/bulk-delete` with `{ agent_uuids }`
 *   (all-or-nothing: a 404 means nothing was removed and lists the missing
 *   uuids under `detail.not_found`).
 * - Single row → `DELETE /agents/{uuid}`.
 */
export function useAgentDeletion<T extends AgentLike>({
  agents,
  onDeleted,
  accessToken,
}: UseAgentDeletionArgs<T>) {
  const [selectedAgentUuids, setSelectedAgentUuids] = useState<Set<string>>(
    new Set(),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [agentToDelete, setAgentToDelete] = useState<T | null>(null);
  const [agentsToDeleteBulk, setAgentsToDeleteBulk] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const hasSelectableAgents = agents.length > 0;

  const toggleAgentSelection = (uuid: string) => {
    setSelectedAgentUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  /** Props for a per-row selection checkbox — keeps call sites a single
   *  `{...spread}`. */
  const agentCheckboxProps = (agent: T) => ({
    checked: selectedAgentUuids.has(agent.uuid),
    onToggle: () => toggleAgentSelection(agent.uuid),
    label: "Select agent",
  });

  const allSelected =
    hasSelectableAgents && selectedAgentUuids.size === agents.length;

  const toggleSelectAll = () => {
    if (selectedAgentUuids.size === agents.length) {
      setSelectedAgentUuids(new Set());
    } else {
      setSelectedAgentUuids(new Set(agents.map((a) => a.uuid)));
    }
  };

  const openDeleteDialog = (agent: T) => {
    setDeleteError(null);
    setAgentToDelete(agent);
    setAgentsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedAgentUuids.size === 0) return;
    setDeleteError(null);
    setAgentToDelete(null);
    setAgentsToDeleteBulk(Array.from(selectedAgentUuids));
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialogOpen(false);
    setAgentToDelete(null);
    setAgentsToDeleteBulk([]);
    setDeleteError(null);
  };

  const deleteAgents = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    const isBulk = agentsToDeleteBulk.length > 0;
    const uuidsToDelete = isBulk
      ? agentsToDeleteBulk
      : agentToDelete
        ? [agentToDelete.uuid]
        : [];
    if (uuidsToDelete.length === 0) return;

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = isBulk
        ? await fetch(`${backendUrl}/agents/bulk-delete`, {
            method: "POST",
            headers: {
              accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ agent_uuids: uuidsToDelete }),
          })
        : await fetch(`${backendUrl}/agents/${uuidsToDelete[0]}`, {
            method: "DELETE",
            headers: {
              accept: "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
          });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      // Bulk delete is all-or-nothing: a 404 means nothing was removed and the
      // response lists which agents blocked it under `detail.not_found`.
      if (isBulk && response.status === 404) {
        const data = await response.json().catch(() => null);
        const detail = data?.detail;
        const notFoundCount = Array.isArray(detail?.not_found)
          ? detail.not_found.length
          : 0;
        setDeleteError(
          notFoundCount > 0
            ? `Nothing was deleted. ${notFoundCount} of the selected agent${
                notFoundCount > 1 ? "s are" : " is"
              } no longer available. Refresh and try again.`
            : (typeof detail?.message === "string"
                ? detail.message
                : "Nothing was deleted."),
        );
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete agent");
      }

      onDeleted(uuidsToDelete);
      setSelectedAgentUuids(new Set());
      setDeleteDialogOpen(false);
      setAgentToDelete(null);
      setAgentsToDeleteBulk([]);
    } catch (err) {
      reportError("Error deleting agents:", err);
      setDeleteError("Something went wrong while deleting. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    selectedAgentUuids,
    allSelected,
    hasSelectableAgents,
    agentCheckboxProps,
    toggleSelectAll,
    deleteDialogOpen,
    agentToDelete,
    agentsToDeleteBulk,
    isDeleting,
    deleteError,
    openDeleteDialog,
    openBulkDeleteDialog,
    closeDeleteDialog,
    deleteAgents,
  };
}
