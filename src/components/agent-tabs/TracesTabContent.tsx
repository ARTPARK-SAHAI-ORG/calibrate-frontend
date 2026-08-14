"use client";

import React, { useRef, useState } from "react";
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
import { LoadingState, PageSizeSelect } from "@/components/ui";
import {
  useAccessToken,
  useDialogUrlParam,
  usePageSize,
  useTraceDeletion,
  useTraces,
  PAGE_SIZE_OPTIONS,
} from "@/hooks";
import { fetchTrace, type TraceDetail } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/**
 * The Traces tab on the agent detail page: the production conversations sent
 * in for this agent, one trace per turn. Every call is scoped to `agentUuid`.
 */
export function TracesTabContent({ agentUuid }: { agentUuid: string }) {
  const router = useRouter();
  const accessToken = useAccessToken();

  const [pageSize, setPageSize] = usePageSize();

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
    pageSize,
  });

  const deletion = useTraceDeletion({
    traces: items,
    onDeleted: (uuids) => handleDeleted(uuids.length),
    accessToken,
  });

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

  // What was selected when the reader pressed submit. The fetches take time and
  // the ticks can change underneath, so the submitted set is what everything
  // afterwards works from.
  const [submittedUuids, setSubmittedUuids] = useState<string[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  const prepareLabelling = async (chosen: SourceEvaluatorRef[]) => {
    setEvaluatorStepOpen(false);
    if (!accessToken) return;
    const uuids = Array.from(selected);
    setSubmittedUuids(uuids);
    setIsPreparingLabelling(true);
    try {
      const settled = await Promise.allSettled(
        uuids.map((uuid) => fetchTrace(accessToken, uuid)),
      );
      // The ticks changed while the traces were loading, so opening the task
      // now would work on rows the reader no longer picked.
      const now = selectedRef.current;
      if (uuids.length !== now.size || uuids.some((uuid) => !now.has(uuid))) {
        toast.error(
          "The selected traces changed while they were loading, so nothing was submitted. Try again.",
        );
        return;
      }
      const loaded = settled
        .filter(
          (result): result is PromiseFulfilledResult<TraceDetail> =>
            result.status === "fulfilled",
        )
        .map((result) => result.value);
      const failed = settled.length - loaded.length;
      if (failed > 0) {
        const firstError = settled.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );
        reportError("Error loading traces for labelling:", firstError?.reason);
      }
      // Nothing loaded, so there is nothing to label.
      if (loaded.length === 0) {
        toast.error("Could not load the selected traces. Please try again.");
        return;
      }
      if (failed > 0) {
        toast.error(
          `${failed} trace${failed === 1 ? "" : "s"} could not be loaded and ${failed === 1 ? "was" : "were"} left out.`,
        );
      }
      setLabellingEvaluators(chosen);
      setLabellingTraces(
        loaded.map((trace) => ({
          // Names are unique within a task, so the trace's own id names it.
          // Anything drawn from the conversation repeats across calls that
          // open the same way, which the backend rejects for the whole batch.
          name: trace.uuid,
          // The agent's own instructions are not part of the conversation the
          // annotators read, so they are never stored with the item.
          input: (trace.input ?? []).filter((turn) => turn.role !== "system"),
          output: trace.output,
        })),
      );
    } finally {
      setIsPreparingLabelling(false);
    }
  };

  /** Untick only the traces that were actually submitted. */
  const clearSubmitted = () => {
    const submitted = new Set(submittedUuids);
    items.forEach((item) => {
      if (submitted.has(item.uuid) && selectedRef.current.has(item.uuid)) {
        deletion.checkboxProps(item).onToggle();
      }
    });
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

  // The full-page spinner belongs to the very first load only. A later check
  // must not replace what is on screen, or the setup steps would be thrown
  // away mid-check along with the key the reader just created.
  const hasLoadedRef = useRef(false);
  if (!isLoading) hasLoadedRef.current = true;
  const hasLoaded = hasLoadedRef.current;

  // With no search, an empty list means exactly one thing: this agent has
  // never been sent a trace. Held from the last load that worked, so neither a
  // check in flight nor a failed one swaps the setup steps out: the key the
  // reader just created lives only on that screen and is shown once.
  const isEmptyRef = useRef(false);
  if (!isLoading && !error) isEmptyRef.current = total === 0;
  const showEmptyState = hasLoaded && isEmptyRef.current;
  // Below the smallest option every trace already fits on one page, so the
  // choice would only be noise.
  const showPageSize = total > PAGE_SIZE_OPTIONS[0];

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
      {!showEmptyState && (
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex items-center gap-2 md:ml-auto">
            <button
              type="button"
              onClick={() => setCodeOpen(true)}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              View code
            </button>
            {/* Outside the selection block: unticking rows while the traces
                load must not make the wait disappear. */}
            {isPreparingLabelling && (
              <button
                type="button"
                disabled
                className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background transition-colors cursor-not-allowed opacity-50"
              >
                Loading traces...
              </button>
            )}
            {selected.size > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => setConvertOpen(true)}
                  className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                >
                  Add to tests ({selected.size})
                </button>
                {!isPreparingLabelling && (
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
          </div>
        </div>
      )}

      {error && (
        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {!hasLoaded ? (
        <LoadingState />
      ) : showEmptyState ? (
        <TracesEmptyState agentUuid={agentUuid} onCheckForTraces={refetch} />
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
          {(showPageSize || hasPrev || hasNext) && (
            <div className="flex flex-wrap items-center justify-end gap-3 text-sm text-muted-foreground">
              {showPageSize && (
                <PageSizeSelect value={pageSize} onChange={setPageSize} />
              )}
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
          const created = result.created;
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
            clearSubmitted();
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

    </div>
  );
}
