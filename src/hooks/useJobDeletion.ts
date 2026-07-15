"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { reportError } from "@/lib/reportError";

type JobLike = { uuid: string };

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
 * and the actual `DELETE /jobs/{uuid}` calls. Kept generic over the job shape
 * so both pages reuse one implementation instead of duplicating it.
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

  const toggleJobSelection = (uuid: string) => {
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

  const allSelected = selectedJobUuids.size === jobs.length && jobs.length > 0;

  const toggleSelectAll = () => {
    if (selectedJobUuids.size === jobs.length) {
      setSelectedJobUuids(new Set());
    } else {
      setSelectedJobUuids(new Set(jobs.map((j) => j.uuid)));
    }
  };

  const openDeleteDialog = (job: T) => {
    setJobToDelete(job);
    setJobsToDeleteBulk([]);
    setDeleteDialogOpen(true);
  };

  const openBulkDeleteDialog = () => {
    if (selectedJobUuids.size === 0) return;
    setJobToDelete(null);
    setJobsToDeleteBulk(Array.from(selectedJobUuids));
    setDeleteDialogOpen(true);
  };

  const closeDeleteDialog = () => {
    if (isJobDeleting) return;
    setDeleteDialogOpen(false);
    setJobToDelete(null);
    setJobsToDeleteBulk([]);
  };

  const deleteJobs = async () => {
    const uuidsToDelete =
      jobsToDeleteBulk.length > 0
        ? jobsToDeleteBulk
        : jobToDelete
          ? [jobToDelete.uuid]
          : [];
    if (uuidsToDelete.length === 0) return;

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    setIsJobDeleting(true);
    try {
      for (const uuid of uuidsToDelete) {
        const response = await fetch(`${backendUrl}/jobs/${uuid}`, {
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

        if (!response.ok) {
          throw new Error("Failed to delete evaluation");
        }
      }

      onDeleted(uuidsToDelete);
      setSelectedJobUuids(new Set());
      setDeleteDialogOpen(false);
      setJobToDelete(null);
      setJobsToDeleteBulk([]);
    } catch (err) {
      reportError("Error deleting evaluations:", err);
    } finally {
      setIsJobDeleting(false);
    }
  };

  return {
    selectedJobUuids,
    allSelected,
    toggleJobSelection,
    toggleSelectAll,
    deleteDialogOpen,
    jobToDelete,
    jobsToDeleteBulk,
    isJobDeleting,
    openDeleteDialog,
    openBulkDeleteDialog,
    closeDeleteDialog,
    deleteJobs,
  };
}
