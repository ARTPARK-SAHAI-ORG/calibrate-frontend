"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";

/** A delete request the caller wants issued — the hook adds auth headers and,
 *  when a `body` is present, the JSON `Content-Type`. */
type DeleteRequest = {
  url: string;
  method: string;
  body?: string;
};

type UseBulkDeletionArgs<T extends { uuid: string }> = {
  /** The currently visible (sorted/filtered) items — drives "select all". */
  items: T[];
  /** Prune the given uuids from the caller's list after a successful delete. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the delete requests. */
  accessToken: string | null;
  /** Accessible label for a row's selection checkbox. */
  selectLabel: string;
  /** Whether an item can be bulk-deleted. Defaults to every item eligible. */
  isEligible?: (item: T) => boolean;
  /** Tooltip for an ineligible item's disabled checkbox. */
  ineligibleTooltip?: (item: T) => string;
  /** Builds the bulk-delete request from the selected uuids. */
  buildBulkRequest: (backendUrl: string, uuids: string[]) => DeleteRequest;
  /** Builds the single-delete request. */
  buildSingleRequest: (backendUrl: string, uuid: string) => DeleteRequest;
  /** HTTP status a bulk request returns when it rejects the whole batch
   *  (all-or-nothing). When the response matches, `formatBulkRejection` turns
   *  the parsed `detail` into the shown error and nothing is pruned. */
  bulkRejectionStatus?: number;
  formatBulkRejection?: (detail: unknown) => string;
};

/**
 * Shared selection + single/bulk delete logic for resource list pages. Manages
 * row selection (single + select-all), the delete dialog state, and the delete
 * calls, while the caller supplies the resource-specific bits: endpoints,
 * eligibility gating, copy, and the all-or-nothing rejection shape.
 *
 * `useJobDeletion` (STT/TTS evaluations) and `useAgentDeletion` (agents) are
 * thin wrappers over this so the two lists share one implementation.
 */
export function useBulkDeletion<T extends { uuid: string }>({
  items,
  onDeleted,
  accessToken,
  selectLabel,
  isEligible = () => true,
  ineligibleTooltip,
  buildBulkRequest,
  buildSingleRequest,
  bulkRejectionStatus,
  formatBulkRejection,
}: UseBulkDeletionArgs<T>) {
  const [selectedUuids, setSelectedUuids] = useState<Set<string>>(new Set());
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<T | null>(null);
  const [itemsToDeleteBulk, setItemsToDeleteBulk] = useState<string[]>([]);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const eligibleItems = items.filter(isEligible);
  const hasSelectableItems = eligibleItems.length > 0;

  // Keep the selection scoped to what's currently visible: when a search (or
  // any change to the list) hides a selected item, drop it so it can never be
  // deleted off-screen. `eligibleKey` is a primitive so this only runs when the
  // visible eligible set actually changes, not on every render.
  const eligibleKey = eligibleItems.map((i) => i.uuid).join(",");
  useEffect(() => {
    const visible = new Set(eligibleItems.map((i) => i.uuid));
    setSelectedUuids((prev) => {
      let changed = false;
      const next = new Set<string>();
      prev.forEach((uuid) => {
        if (visible.has(uuid)) next.add(uuid);
        else changed = true;
      });
      return changed ? next : prev;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleKey]);

  const toggleSelection = (uuid: string) => {
    const item = items.find((i) => i.uuid === uuid);
    if (item && !isEligible(item)) return;
    setSelectedUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  /** Props for a per-row selection checkbox — folds eligibility/tooltip in so
   *  call sites stay a single `{...spread}`. */
  const checkboxProps = (item: T) => {
    const eligible = isEligible(item);
    return {
      checked: selectedUuids.has(item.uuid),
      onToggle: () => toggleSelection(item.uuid),
      disabled: !eligible,
      label: selectLabel,
      tooltip: eligible ? undefined : ineligibleTooltip?.(item),
    };
  };

  const allSelected =
    hasSelectableItems && selectedUuids.size === eligibleItems.length;

  const toggleSelectAll = () => {
    if (selectedUuids.size === eligibleItems.length) {
      setSelectedUuids(new Set());
    } else {
      setSelectedUuids(new Set(eligibleItems.map((i) => i.uuid)));
    }
  };

  const openDeleteDialog = (item: T) => {
    setDeleteError(null);
    setItemToDelete(item);
    setItemsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedUuids.size === 0) return;
    setDeleteError(null);
    setItemToDelete(null);
    setItemsToDeleteBulk(Array.from(selectedUuids));
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isDeleting) return;
    setDeleteDialogOpen(false);
    setItemToDelete(null);
    setItemsToDeleteBulk([]);
    setDeleteError(null);
  };

  const deleteItems = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    const isBulk = itemsToDeleteBulk.length > 0;
    const uuidsToDelete = isBulk
      ? itemsToDeleteBulk
      : itemToDelete
        ? [itemToDelete.uuid]
        : [];
    if (uuidsToDelete.length === 0) return;

    const request = isBulk
      ? buildBulkRequest(backendUrl, uuidsToDelete)
      : buildSingleRequest(backendUrl, uuidsToDelete[0]);

    setIsDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
          ...(request.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(request.body ? { body: request.body } : {}),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      // All-or-nothing bulk rejection: nothing was removed, so surface the
      // reason and leave the dialog open instead of pruning the list.
      if (
        isBulk &&
        bulkRejectionStatus !== undefined &&
        response.status === bulkRejectionStatus
      ) {
        const data = await response.json().catch(() => null);
        setDeleteError(
          formatBulkRejection
            ? formatBulkRejection(data?.detail)
            : "Nothing was deleted.",
        );
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete");
      }

      onDeleted(uuidsToDelete);
      setSelectedUuids(new Set());
      setDeleteDialogOpen(false);
      setItemToDelete(null);
      setItemsToDeleteBulk([]);
    } catch (err) {
      reportError("Error deleting:", err);
      setDeleteError("Something went wrong while deleting. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  return {
    selectedUuids,
    allSelected,
    hasSelectableItems,
    checkboxProps,
    toggleSelectAll,
    deleteDialogOpen,
    itemToDelete,
    itemsToDeleteBulk,
    isDeleting,
    deleteError,
    openDeleteDialog,
    openBulkDeleteDialog,
    closeDeleteDialog,
    deleteItems,
  };
}
