"use client";

import { useBulkDeletion } from "./useBulkDeletion";
import {
  selectAllBody,
  type TraceFilters,
  type TraceSummary,
} from "@/lib/tracesApi";

type UseTraceDeletionArgs = {
  /** The currently visible page of traces — drives the "select all" toggle. */
  traces: TraceSummary[];
  /** Called with the deleted uuids so the page can re-sync its list. */
  onDeleted: (uuids: string[]) => void | Promise<void>;
  /** Backend JWT used for the delete requests. */
  accessToken: string | null;
  /** Set when the reader asked for every trace the list matches, not only the
   *  ticked ones: the delete is then sent as those filters. */
  selectAll?: TraceFilters | null;
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
  selectAll = null,
}: UseTraceDeletionArgs) {
  return useBulkDeletion<TraceSummary>({
    items: traces,
    onDeleted,
    accessToken,
    selectLabel: "Select trace",
    // The traces list loads one page at a time, so a tick has to survive the
    // reader moving to another page: they pick traces while reading them, one
    // after another, and the page turns under them. TracesTabContent clears
    // the selection whenever the list is searched or filtered.
    keepSelectionAcrossPages: true,
    buildBulkRequest: (backendUrl, uuids) =>
      selectAll
        ? {
            url: `${backendUrl}/traces/bulk-delete`,
            method: "POST",
            body: JSON.stringify(selectAllBody(selectAll)),
          }
        : buildRequest(backendUrl, uuids),
    buildSingleRequest: (backendUrl, uuid) => buildRequest(backendUrl, [uuid]),
  });
}
