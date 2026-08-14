"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "@/lib/nav";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TracesTable } from "@/components/traces/TracesTable";
import { TraceDetailDialog } from "@/components/traces/TraceDetailDialog";
import { TracesEmptyState } from "@/components/traces/TracesEmptyState";
import { ConvertTracesToTestsDialog } from "@/components/traces/ConvertTracesToTestsDialog";
import { TraceLabellingEvaluatorsDialog } from "@/components/traces/TraceLabellingEvaluatorsDialog";
import { TraceIngestCodeDialog } from "@/components/traces/TraceIngestCodeDialog";
import {
  AddRunToLabellingTaskDialog,
  type SourceEvaluatorRef,
  type TraceLabellingItem,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { SubmitForLabellingButton } from "@/components/human-labelling/labellingSubmit";
import { LoadingState, SearchInput } from "@/components/ui";
import {
  useAccessToken,
  useDialogUrlParam,
  useTraceDeletion,
  useTraces,
} from "@/hooks";
import {
  bulkDeleteMatchingTraces,
  fetchTrace,
  type TraceDetail,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

const SEARCH_DEBOUNCE_MS = 300;

/** What a trace is called in the labelling task: its message id, else the
 *  first thing the caller said, else a plain word. */
function traceLabellingName(trace: TraceDetail): string {
  if (trace.message_id) return trace.message_id;
  const firstUser = trace.input?.find(
    (turn) =>
      turn.role === "user" &&
      typeof turn.content === "string" &&
      turn.content.trim(),
  );
  return typeof firstUser?.content === "string"
    ? firstUser.content.trim()
    : "Trace";
}

/**
 * The Traces tab on the agent detail page: the production conversations sent
 * in for this agent, one trace per turn. Every call is scoped to `agentUuid`.
 */
export function TracesTabContent({ agentUuid }: { agentUuid: string }) {
  const router = useRouter();
  const accessToken = useAccessToken();

  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const timer = setTimeout(
      () => setDebouncedQuery(searchQuery),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const {
    items,
    total,
    isLoading,
    error,
    handleDeleted,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
    refetch,
  } = useTraces({
    accessToken,
    agentId: agentUuid,
    q: debouncedQuery,
  });

  const deletion = useTraceDeletion({
    traces: items,
    onDeleted: (uuids) => handleDeleted(uuids.length),
    accessToken,
  });

  // "Delete everything matching this search" — the select_all path covers
  // rows beyond the loaded page, which checkbox selection can't reach.
  const filtersActive = Boolean(debouncedQuery.trim());
  const [deleteMatchingOpen, setDeleteMatchingOpen] = useState(false);
  const [isDeletingMatching, setIsDeletingMatching] = useState(false);
  const deleteMatching = async () => {
    if (!accessToken) return;
    setIsDeletingMatching(true);
    try {
      const result = await bulkDeleteMatchingTraces(accessToken, {
        agentId: agentUuid,
        q: debouncedQuery,
      });
      setDeleteMatchingOpen(false);
      handleDeleted(result.deleted);
    } catch (err) {
      reportError("Error deleting matching traces:", err);
    } finally {
      setIsDeletingMatching(false);
    }
  };

  // Add selected traces as tests. A recorded response always becomes a response
  // test; tool-call tests are used only when every selected trace has calls and
  // no text response.
  const [convertOpen, setConvertOpen] = useState(false);
  const selected = deletion.selectedUuids;
  const selectedTraces = items.filter((trace) => selected.has(trace.uuid));
  const selectedTestType =
    selectedTraces.length > 0 &&
    selectedTraces.every(
      (trace) => !trace.response_preview && trace.tool_call_count > 0,
    )
      ? "tool_call"
      : "response";

  // Send selected traces for labelling. Step one asks which evaluators the
  // annotators score against; step two needs the full traces, which the list
  // rows only preview, so they are fetched before the task dialog opens.
  const [evaluatorStepOpen, setEvaluatorStepOpen] = useState(false);
  const [isPreparingLabelling, setIsPreparingLabelling] = useState(false);
  const [labellingEvaluators, setLabellingEvaluators] = useState<
    SourceEvaluatorRef[]
  >([]);
  const [labellingTraces, setLabellingTraces] = useState<
    TraceLabellingItem[] | null
  >(null);

  const prepareLabelling = async (chosen: SourceEvaluatorRef[]) => {
    setEvaluatorStepOpen(false);
    if (!accessToken) return;
    setIsPreparingLabelling(true);
    try {
      const details = await Promise.all(
        Array.from(selected).map((uuid) => fetchTrace(accessToken, uuid)),
      );
      setLabellingEvaluators(chosen);
      setLabellingTraces(
        details.map((trace) => ({
          name: traceLabellingName(trace),
          input: trace.input,
          output: trace.output,
        })),
      );
    } catch (err) {
      reportError("Error loading traces for labelling:", err);
      toast.error("Could not load the selected traces. Please try again.");
    } finally {
      setIsPreparingLabelling(false);
    }
  };

  // The setup steps go away once the first trace lands, so the code that sends
  // one stays reachable from here: to add another service, or to check a field.
  const [codeOpen, setCodeOpen] = useState(false);

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

  const showEmptyState = !isLoading && !error && total === 0 && !filtersActive;

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
      {!showEmptyState && (
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search traces"
            className="w-full md:max-w-md"
          />
          <div className="flex items-center gap-2 md:ml-auto">
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              View code
            </button>
            {selected.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Add to tests ({selected.size})
                </button>
                {isPreparingLabelling ? (
                  <button
                    type="button"
                    disabled
                    className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background transition-colors cursor-not-allowed opacity-50"
                  >
                    Loading traces...
                  </button>
                ) : (
                  <SubmitForLabellingButton
                    count={selected.size}
                    emptyMessage="Select at least one trace to submit for labelling."
                    onOpen={() => setEvaluatorStepOpen(true)}
                    className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                  />
                )}
                <button
                  type="button"
                  onClick={deletion.openBulkDeleteDialog}
                  className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 text-red-600 dark:text-red-400 transition-colors cursor-pointer"
                >
                  Delete selected ({selected.size})
                </button>
              </>
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
        <TracesEmptyState agentUuid={agentUuid} onCheckForTraces={refetch} />
      ) : items.length === 0 ? (
        <div className="border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
          No traces match your search.
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString()} {total === 1 ? "trace" : "traces"}
          </p>
          <TracesTable
            traces={items}
            checkboxProps={deletion.checkboxProps}
            allSelected={deletion.allSelected}
            hasSelectableItems={deletion.hasSelectableItems}
            onToggleSelectAll={deletion.toggleSelectAll}
            onOpen={openTrace}
            onDelete={deletion.openDeleteDialog}
          />
          {(hasPrev || hasNext) && (
            <div className="flex items-center justify-end gap-2">
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
        </>
      )}

      <TraceIngestCodeDialog
        isOpen={codeOpen}
        onClose={() => setCodeOpen(false)}
        agentUuid={agentUuid}
      />

      <TraceDetailDialog
        isOpen={openTraceUuid != null}
        onClose={closeTrace}
        accessToken={accessToken}
        traceUuid={openTraceUuid}
      />

      <ConvertTracesToTestsDialog
        isOpen={convertOpen}
        onClose={() => setConvertOpen(false)}
        accessToken={accessToken}
        traceUuids={Array.from(selected)}
        testType={selectedTestType}
        agentUuid={agentUuid}
        onConverted={(result) => {
          setConvertOpen(false);
          deletion.clearSelection();
          const created = result.test_uuids.length;
          toast.success(
            `Created ${created} test${created === 1 ? "" : "s"}`,
            {
              action: {
                label: "View tests",
                onClick: () => router.push("/tests"),
              },
            },
          );
        }}
      />

      {/* Mounted only while open, so each visit starts from the agent's own
          evaluators rather than the last visit's ticks. */}
      {evaluatorStepOpen && (
        <TraceLabellingEvaluatorsDialog
          isOpen
          onClose={() => setEvaluatorStepOpen(false)}
          agentUuid={agentUuid}
          accessToken={accessToken}
          onChosen={prepareLabelling}
        />
      )}

      {labellingTraces && (
        <AddRunToLabellingTaskDialog
          isOpen
          onClose={() => setLabellingTraces(null)}
          source={{
            type: "traces",
            agentUuid,
            traces: labellingTraces,
            evaluators: labellingEvaluators,
          }}
          onAdded={() => {
            setLabellingTraces(null);
            deletion.clearSelection();
          }}
        />
      )}

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
          "Deleting frees workspace capacity. This cannot be undone."
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
        message="Every trace matching the current search will be deleted, including traces not shown on this page. This frees workspace capacity and cannot be undone."
        confirmText="Delete all"
        isDeleting={isDeletingMatching}
      />
    </div>
  );
}
