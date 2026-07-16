"use client";

import { useBulkDeletion } from "./useBulkDeletion";

type AgentLike = { uuid: string; name: string };

type UseAgentDeletionArgs<T extends AgentLike> = {
  /** The currently visible (sorted/filtered) agents — drives "select all". */
  agents: T[];
  /** Prune the given uuids from the page's agent list after a successful
   *  delete. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the delete requests. */
  accessToken: string | null;
};

/** Turns the bulk-delete 404 `detail` (all-or-nothing) into shown copy. */
function formatBulkRejection(detail: unknown): string {
  const d = detail as { not_found?: unknown; message?: unknown } | null;
  const notFoundCount = Array.isArray(d?.not_found) ? d.not_found.length : 0;
  if (notFoundCount > 0) {
    return `Nothing was deleted. ${notFoundCount} of the selected agent${
      notFoundCount > 1 ? "s are" : " is"
    } no longer available. Refresh and try again.`;
  }
  return typeof d?.message === "string" ? d.message : "Nothing was deleted.";
}

/**
 * Selection + single/bulk delete for the agents list. Every agent is eligible
 * (no status gating, unlike jobs). Bulk → `POST /agents/bulk-delete` with
 * `{ agent_uuids }` (all-or-nothing: a 404 lists the missing uuids under
 * `detail.not_found`); single → `DELETE /agents/{uuid}`. Thin wrapper over the
 * shared `useBulkDeletion`, exposing agent-named fields for the call site.
 */
export function useAgentDeletion<T extends AgentLike>({
  agents,
  onDeleted,
  accessToken,
}: UseAgentDeletionArgs<T>) {
  const base = useBulkDeletion<T>({
    items: agents,
    onDeleted,
    accessToken,
    selectLabel: "Select agent",
    buildBulkRequest: (backendUrl, uuids) => ({
      url: `${backendUrl}/agents/bulk-delete`,
      method: "POST",
      body: JSON.stringify({ agent_uuids: uuids }),
    }),
    buildSingleRequest: (backendUrl, uuid) => ({
      url: `${backendUrl}/agents/${uuid}`,
      method: "DELETE",
    }),
    bulkRejectionStatus: 404,
    formatBulkRejection,
  });

  return {
    selectedAgentUuids: base.selectedUuids,
    allSelected: base.allSelected,
    hasSelectableAgents: base.hasSelectableItems,
    agentCheckboxProps: base.checkboxProps,
    toggleSelectAll: base.toggleSelectAll,
    deleteDialogOpen: base.deleteDialogOpen,
    agentToDelete: base.itemToDelete,
    agentsToDeleteBulk: base.itemsToDeleteBulk,
    isDeleting: base.isDeleting,
    deleteError: base.deleteError,
    openDeleteDialog: base.openDeleteDialog,
    openBulkDeleteDialog: base.openBulkDeleteDialog,
    closeDeleteDialog: base.closeDeleteDialog,
    deleteAgents: base.deleteItems,
  };
}
