"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";

type JobLike = { uuid: string; status: string };

/** Only finished jobs can be removed via the single-shot bulk endpoint. */
const BULK_DELETABLE_STATUSES = new Set(["done", "failed"]);

/** Hover hint for a checkbox whose job can't be bulk-deleted, phrased for the
 *  job's actual status (queued vs in progress). */
const bulkDeleteBlockedHint = (status: string) => {
  const state = status === "queued" ? "Queued" : "In-progress";
  return `${state} evaluations can't be bulk deleted. Use the delete icon to remove this one.`;
};

type UseJobDeletionArgs<T extends JobLike> = {
  /** The currently visible (sorted) jobs — drives the "select all" toggle. */
  jobs: T[];
  /** Prune the given uuids from the page's job list after a successful delete. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the DELETE request. */
  accessToken: string | null;
};

/**
 * Shared selection + delete logic for the STT/TTS evaluation lists. Manages
 * row selection (single + select-all), the single/bulk delete dialog state,
 * and the delete calls against the generic jobs API. Kept generic over the
 * job shape so both pages reuse one implementation instead of duplicating it.
 *
 * Delete routing:
 * - Bulk selection → `DELETE /jobs` with `{ job_uuids }` (all-or-nothing,
 *   only finished jobs are eligible, so active jobs are excluded from
 *   selection up front).
 * - Single row → `DELETE /jobs/{uuid}` (stops the job first, so it works for
 *   queued/in-progress jobs too).
 */
export function useJobDeletion<T extends JobLike>({
  jobs,
  onDeleted,
  accessToken,
}: UseJobDeletionArgs<T>) {
  const [selectedJobUuids, setSelectedJobUuids] = useState<Set<string>>(
    new Set(),
  );
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [jobToDelete, setJobToDelete] = useState<T | null>(null);
  const [jobsToDeleteBulk, setJobsToDeleteBulk] = useState<string[]>([]);
  const [isJobDeleting, setIsJobDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const isBulkDeletable = (job: T) => BULK_DELETABLE_STATUSES.has(job.status);
  const eligibleJobs = jobs.filter(isBulkDeletable);
  const hasBulkDeletableJobs = eligibleJobs.length > 0;

  /** Props for a per-row selection checkbox — folds the eligibility/tooltip
   *  logic here so the call sites stay a single `{...spread}`. */
  const jobCheckboxProps = (job: T) => {
    const deletable = isBulkDeletable(job);
    return {
      checked: selectedJobUuids.has(job.uuid),
      onToggle: () => toggleJobSelection(job.uuid),
      disabled: !deletable,
      label: "Select evaluation",
      tooltip: deletable ? undefined : bulkDeleteBlockedHint(job.status),
    };
  };

  const toggleJobSelection = (uuid: string) => {
    const job = jobs.find((j) => j.uuid === uuid);
    if (job && !isBulkDeletable(job)) return;
    setSelectedJobUuids((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const allSelected =
    hasBulkDeletableJobs && selectedJobUuids.size === eligibleJobs.length;

  const toggleSelectAll = () => {
    if (selectedJobUuids.size === eligibleJobs.length) {
      setSelectedJobUuids(new Set());
    } else {
      setSelectedJobUuids(new Set(eligibleJobs.map((j) => j.uuid)));
    }
  };

  const openDeleteDialog = (job: T) => {
    setDeleteError(null);
    setJobToDelete(job);
    setJobsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedJobUuids.size === 0) return;
    setDeleteError(null);
    setJobToDelete(null);
    setJobsToDeleteBulk(Array.from(selectedJobUuids));
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isJobDeleting) return;
    setDeleteDialogOpen(false);
    setJobToDelete(null);
    setJobsToDeleteBulk([]);
    setDeleteError(null);
  };

  const deleteJobs = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    const isBulk = jobsToDeleteBulk.length > 0;
    const uuidsToDelete = isBulk
      ? jobsToDeleteBulk
      : jobToDelete
        ? [jobToDelete.uuid]
        : [];
    if (uuidsToDelete.length === 0) return;

    setIsJobDeleting(true);
    setDeleteError(null);
    try {
      const response = isBulk
        ? await fetch(`${backendUrl}/jobs`, {
            method: "DELETE",
            headers: {
              accept: "application/json",
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ job_uuids: uuidsToDelete }),
          })
        : await fetch(`${backendUrl}/jobs/${uuidsToDelete[0]}`, {
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

      // Bulk delete is all-or-nothing: a 400 means nothing was removed and the
      // response lists which jobs blocked it (still active or not found).
      if (isBulk && response.status === 400) {
        const data = await response.json().catch(() => null);
        const detail = data?.detail;
        const reasons: string[] = [];
        if (detail?.active?.length) reasons.push("still running");
        if (detail?.not_found?.length) reasons.push("no longer available");
        setDeleteError(
          reasons.length
            ? `Nothing was deleted — some evaluations are ${reasons.join(
                " or ",
              )}. Refresh and try again with finished evaluations only.`
            : (detail?.message ?? "Nothing was deleted."),
        );
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to delete evaluation");
      }

      onDeleted(uuidsToDelete);
      setSelectedJobUuids(new Set());
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      setJobsToDeleteBulk([]);
    } catch (err) {
      reportError("Error deleting evaluations:", err);
      setDeleteError("Something went wrong while deleting. Please try again.");
    } finally {
      setIsJobDeleting(false);
    }
  };

  return {
    selectedJobUuids,
    allSelected,
    hasBulkDeletableJobs,
    jobCheckboxProps,
    toggleSelectAll,
    deleteDialogOpen,
    jobsToDeleteBulk,
    isJobDeleting,
    deleteError,
    openDeleteDialog,
    openBulkDeleteDialog,
    closeDeleteDialog,
    deleteJobs,
  };
}
