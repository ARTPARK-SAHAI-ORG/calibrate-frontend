"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TracesTable } from "@/components/traces/TracesTable";
import { TraceDetailDialog } from "@/components/traces/TraceDetailDialog";
import { TracesEmptyState } from "@/components/traces/TracesEmptyState";
import { LoadingState, SearchInput } from "@/components/ui";
import {
  useAccessToken,
  useDialogUrlParam,
  useMaxTraces,
  useTraceCount,
  useTraceDeletion,
  useTraces,
} from "@/hooks";
import { bulkDeleteMatchingTraces } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";
import { useSidebarState } from "@/lib/sidebar";

const SEARCH_DEBOUNCE_MS = 300;

function TracesPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  useEffect(() => {
    document.title = "Traces | Calibrate";
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(searchQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // The conversation filter deep-links (?conversation_id=...) so a row's
  // conversation pill yields a shareable, reload-safe view.
  const conversationId = searchParams.get("conversation_id");
  const setConversationFilter = useCallback(
    (value: string | null) => {
      const params = new URLSearchParams(window.location.search);
      if (value) params.set("conversation_id", value);
      else params.delete("conversation_id");
      const query = params.toString();
      router.replace(query ? `/traces?${query}` : "/traces");
    },
    [router],
  );

  const {
    items,
    total,
    offset,
    isLoading,
    error,
    handleDeleted,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  } = useTraces({
    accessToken,
    q: debouncedQuery,
    conversationId,
  });

  const [usageRefreshKey, setUsageRefreshKey] = useState(0);
  const traceCount = useTraceCount(accessToken, usageRefreshKey);
  const maxTraces = useMaxTraces();

  const deletion = useTraceDeletion({
    traces: items,
    onDeleted: (uuids) => {
      handleDeleted(uuids.length);
      setUsageRefreshKey((key) => key + 1);
    },
    accessToken,
  });

  // "Delete everything matching this filter" — the select_all path covers
  // rows beyond the loaded page, which checkbox selection can't reach.
  const filtersActive = Boolean(debouncedQuery.trim() || conversationId);
  const [deleteMatchingOpen, setDeleteMatchingOpen] = useState(false);
  const [isDeletingMatching, setIsDeletingMatching] = useState(false);
  const deleteMatching = async () => {
    if (!accessToken) return;
    setIsDeletingMatching(true);
    try {
      const result = await bulkDeleteMatchingTraces(accessToken, {
        q: debouncedQuery,
        conversationId: conversationId ?? undefined,
      });
      setDeleteMatchingOpen(false);
      handleDeleted(result.deleted);
      setUsageRefreshKey((key) => key + 1);
    } catch (err) {
      reportError("Error deleting matching traces:", err);
    } finally {
      setIsDeletingMatching(false);
    }
  };

  const [openTraceUuid, setOpenTraceUuid] = useState<string | null>(null);
  const { setParam: setTraceParam } = useDialogUrlParam({
    param: "traceId",
    onOpen: (value) => setOpenTraceUuid(value),
    onClose: () => setOpenTraceUuid(null),
  });
  const openTrace = (uuid: string) => {
    setOpenTraceUuid(uuid);
    setTraceParam(uuid);
  };
  const closeTrace = () => {
    setOpenTraceUuid(null);
    setTraceParam(null);
  };

  const showEmptyState =
    !isLoading && !error && total === 0 && !filtersActive;
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + items.length, total);

  return (
    <AppLayout
      activeItem="traces"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">Traces</h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1">
              Production conversations ingested from your agent, one trace per
              turn.
            </p>
            {traceCount != null && (
              <p className="text-xs text-muted-foreground mt-1">
                {traceCount.toLocaleString()} / {maxTraces.toLocaleString()}{" "}
                traces stored
              </p>
            )}
          </div>
        </div>

        {!showEmptyState && (
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search traces"
              className="w-full md:max-w-md"
            />
            {conversationId && (
              <button
                type="button"
                onClick={() => setConversationFilter(null)}
                title="Clear conversation filter"
                className="flex items-center gap-1.5 font-mono text-xs px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted text-foreground transition-colors cursor-pointer max-w-full"
              >
                <span className="truncate">{conversationId}</span>
                <span aria-hidden>×</span>
              </button>
            )}
            <div className="flex items-center gap-2 md:ml-auto">
              {deletion.selectedUuids.size > 0 && (
                <button
                  type="button"
                  onClick={deletion.openBulkDeleteDialog}
                  className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                >
                  Delete selected ({deletion.selectedUuids.size})
                </button>
              )}
              {filtersActive && total > 0 && (
                <button
                  type="button"
                  onClick={() => setDeleteMatchingOpen(true)}
                  className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                >
                  Delete all {total.toLocaleString()} matching
                </button>
              )}
            </div>
          </div>
        )}

        {error && (
          <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        {isLoading ? (
          <LoadingState />
        ) : showEmptyState ? (
          <TracesEmptyState />
        ) : items.length === 0 ? (
          <div className="border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
            No traces match your filters.
          </div>
        ) : (
          <>
            <TracesTable
              traces={items}
              checkboxProps={deletion.checkboxProps}
              allSelected={deletion.allSelected}
              hasSelectableItems={deletion.hasSelectableItems}
              onToggleSelectAll={deletion.toggleSelectAll}
              onOpen={openTrace}
              onDelete={deletion.openDeleteDialog}
              onFilterConversation={(value) => setConversationFilter(value)}
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Showing {rangeStart.toLocaleString()}–
                {rangeEnd.toLocaleString()} of {total.toLocaleString()}
              </p>
              {(hasPrev || hasNext) && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={prevPage}
                    disabled={!hasPrev}
                    className="h-9 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    onClick={nextPage}
                    disabled={!hasNext}
                    className="h-9 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <TraceDetailDialog
        isOpen={openTraceUuid != null}
        onClose={closeTrace}
        accessToken={accessToken}
        traceUuid={openTraceUuid}
      />

      <DeleteConfirmationDialog
        isOpen={deletion.deleteDialogOpen}
        onClose={deletion.closeDeleteDialog}
        onConfirm={deletion.deleteItems}
        title={
          deletion.itemsToDeleteBulk.length > 0
            ? `Delete ${deletion.itemsToDeleteBulk.length} trace${deletion.itemsToDeleteBulk.length === 1 ? "" : "s"}?`
            : "Delete this trace?"
        }
        message={
          deletion.deleteError ??
          "Deleting frees workspace capacity and lets the same message be ingested again."
        }
        confirmText="Delete"
        isDeleting={deletion.isDeleting}
      />

      <DeleteConfirmationDialog
        isOpen={deleteMatchingOpen}
        onClose={() => {
          if (!isDeletingMatching) setDeleteMatchingOpen(false);
        }}
        onConfirm={deleteMatching}
        title={`Delete all ${total.toLocaleString()} matching traces?`}
        message="Every trace matching the current search and conversation filter will be deleted, including ones not shown on this page."
        confirmText="Delete all"
        isDeleting={isDeletingMatching}
      />
    </AppLayout>
  );
}

export default function TracesPage() {
  return (
    <Suspense>
      <TracesPageInner />
    </Suspense>
  );
}
