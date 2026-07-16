"use client";

import { useBulkDeletion } from "./useBulkDeletion";

type JobLike = { uuid: string; status: string };

/** Only finished jobs can be removed via the single-shot bulk endpoint. */
const BULK_DELETABLE_STATUSES = new Set(["done", "failed"]);

/** Hover hint for a checkbox whose job can't be bulk-deleted, phrased for the
 *  job's actual status (queued vs in progress). */
const bulkDeleteBlockedHint = (status: string) => {
  const state = status === "queued" ? "Queued" : "In-progress";
  return `${state} evaluations can't be bulk deleted. Use the delete icon to remove this one.`;
};

/** Turns the bulk-delete 400 `detail` (all-or-nothing) into shown copy. */
function formatBulkRejection(detail: unknown): string {
  const d = detail as
    | { active?: unknown[]; not_found?: unknown[]; message?: unknown }
    | null;
  const reasons: string[] = [];
  if (d?.active?.length) reasons.push("still running");
  if (d?.not_found?.length) reasons.push("no longer available");
  if (reasons.length) {
    return `Nothing was deleted. Some evaluations are ${reasons.join(
      " or ",
    )}. Refresh and try again with finished evaluations only.`;
  }
  return typeof d?.message === "string" ? d.message : "Nothing was deleted.";
}

type UseJobDeletionArgs<T extends JobLike> = {
  /** The currently visible (sorted) jobs — drives the "select all" toggle. */
  jobs: T[];
  /** Prune the given uuids from the page's job list after a successful delete. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the DELETE request. */
  accessToken: string | null;
};

/**
 * Shared selection + delete logic for the STT/TTS evaluation lists. Only
 * finished jobs are bulk-deletable (active jobs are excluded from selection up
 * front), so bulk delete routes to `DELETE /jobs` with `{ job_uuids }`
 * (all-or-nothing) while a single row routes to `DELETE /jobs/{uuid}` (which
 * stops the job first, so it works for queued/in-progress jobs too). Thin
 * wrapper over the shared `useBulkDeletion`, exposing job-named fields.
 */
export function useJobDeletion<T extends JobLike>({
  jobs,
  onDeleted,
  accessToken,
}: UseJobDeletionArgs<T>) {
  const base = useBulkDeletion<T>({
    items: jobs,
    onDeleted,
    accessToken,
    selectLabel: "Select evaluation",
    isEligible: (job) => BULK_DELETABLE_STATUSES.has(job.status),
    ineligibleTooltip: (job) => bulkDeleteBlockedHint(job.status),
    buildBulkRequest: (backendUrl, uuids) => ({
      url: `${backendUrl}/jobs`,
      method: "DELETE",
      body: JSON.stringify({ job_uuids: uuids }),
    }),
    buildSingleRequest: (backendUrl, uuid) => ({
      url: `${backendUrl}/jobs/${uuid}`,
      method: "DELETE",
    }),
    bulkRejectionStatus: 400,
    formatBulkRejection,
  });

  return {
    selectedJobUuids: base.selectedUuids,
    allSelected: base.allSelected,
    hasBulkDeletableJobs: base.hasSelectableItems,
    jobCheckboxProps: base.checkboxProps,
    toggleSelectAll: base.toggleSelectAll,
    deleteDialogOpen: base.deleteDialogOpen,
    jobsToDeleteBulk: base.itemsToDeleteBulk,
    isJobDeleting: base.isDeleting,
    deleteError: base.deleteError,
    openDeleteDialog: base.openDeleteDialog,
    openBulkDeleteDialog: base.openBulkDeleteDialog,
    closeDeleteDialog: base.closeDeleteDialog,
    deleteJobs: base.deleteItems,
  };
}
