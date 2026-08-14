"use client";

import { useBulkDeletion } from "./useBulkDeletion";
import type { TraceSummary } from "@/lib/tracesApi";

type UseTraceDeletionArgs = {
  /** The currently visible page of traces — drives the "select all" toggle. */
  traces: TraceSummary[];
  /** Called with the deleted uuids so the page can re-sync its list. */
  onDeleted: (uuids: string[]) => void;
  /** Backend JWT used for the delete requests. */
  accessToken: string | null;
};

// Single and bulk deletes both go through `POST /traces/bulk-delete` — there
// is no per-trace DELETE endpoint (destructive trace routes are JWT-only and
// batched by design).
function buildRequest(backendUrl: string, uuids: string[]) {
  return {
    url: `${backendUrl}/traces/bulk-delete`,
    method: "POST",
    body: JSON.stringify({ trace_ids: uuids }),
  };
}

/**
 * Selection + delete logic for the traces list. Thin wrapper over the shared
 * `useBulkDeletion`, mirroring `useJobDeletion` / `useAgentDeletion`.
 */
export function useTraceDeletion({
  traces,
  onDeleted,
  accessToken,
}: UseTraceDeletionArgs) {
  return useBulkDeletion<TraceSummary>({
    items: traces,
    onDeleted,
    accessToken,
    selectLabel: "Select trace",
    buildBulkRequest: buildRequest,
    buildSingleRequest: (backendUrl, uuid) => buildRequest(backendUrl, [uuid]),
  });
}
