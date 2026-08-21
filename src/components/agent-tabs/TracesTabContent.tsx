"use client";

import React, { useEffect, useRef, useState } from "react";
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
import { SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Button,
  LoadingState,
  SearchInput,
  ServerPaginatedListBar,
} from "@/components/ui";
import {
  useAccessToken,
  useDialogUrlParam,
  useItemPager,
  usePageSize,
  useTraceDeletion,
  useTraces,
} from "@/hooks";
import { fetchTrace, type TraceDetail } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/**
 * The Traces tab on the agent detail page: the production conversations sent
 * in for this agent, one trace per turn. Every call is scoped to `agentUuid`.
 */
export function TracesTabContent({
  agentUuid,
  onTestsCreated,
  onViewTests,
}: {
  agentUuid: string;
  /** Called after traces are turned into tests, so the Tests tab reloads. */
  onTestsCreated: () => void;
  /** Opens the Tests tab, where the created tests are listed. */
  onViewTests: () => void;
}) {
  const accessToken = useAccessToken();

  const [pageSize, setPageSize] = usePageSize();

  // The search runs on the backend, so wait for a pause in typing before
  // asking for a new page.
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const handle = window.setTimeout(() => setSearch(searchInput), 300);
    return () => window.clearTimeout(handle);
  }, [searchInput]);

  const {
    items,
    total,
    loadedQ,
    offset,
    setOffset,
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
    q: search,
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

  // Annotators score the agent's reply, so a trace that only made tool calls
  // has nothing to label and is left out of what is submitted.
  const labellableUuids = selectedTraces
    .filter((trace) => !!trace.response_preview?.trim())
    .map((trace) => trace.uuid);

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
  const labellableRef = useRef(labellableUuids);
  labellableRef.current = labellableUuids;

  const prepareLabelling = async (chosen: SourceEvaluatorRef[]) => {
    setEvaluatorStepOpen(false);
    if (!accessToken) return;
    const uuids = labellableRef.current;
    setSubmittedUuids(uuids);
    setIsPreparingLabelling(true);
    try {
      const settled = await Promise.allSettled(
        uuids.map((uuid) => fetchTrace(accessToken, uuid)),
      );
      // The ticks changed while the traces were loading, so opening the task
      // now would work on rows the reader no longer picked.
      const now = new Set(labellableRef.current);
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
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refetch();
    } finally {
      setIsRefreshing(false);
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
  const itemPager = useItemPager({
    items,
    openUuid: openTraceUuid,
    pageStart: offset,
    pageSize,
    total,
    onOpen: openTrace,
    onPageStartChange: setOffset,
  });
  const closeTrace = () => {
    itemPager.cancel();
    setOpenTraceUuid(null);
    setTraceParam(null);
  };

  // The full-page spinner belongs to the very first load only. A later check
  // must not replace what is on screen, or the setup steps would be thrown
  // away mid-check along with the key the reader just created.
  const hasLoadedRef = useRef(false);
  if (!isLoading) hasLoadedRef.current = true;
  const hasLoaded = hasLoadedRef.current;

  // The setup steps are for an agent that has never been sent a trace, so only
  // a load with no search text can decide that. Held from the last load that
  // worked, so neither a check in flight nor a failed one swaps the steps out:
  // the key the reader just created lives only on that screen and is shown once.
  // All three texts count: the moment anything is typed an empty list can no
  // longer mean "never sent a trace", and after the box is cleared the rows on
  // screen are still the old search until the full list has loaded back.
  const isSearching =
    searchInput.trim() !== "" || search.trim() !== "" || loadedQ.trim() !== "";
  const isEmptyRef = useRef(false);
  if (!isLoading && !error && !isSearching) isEmptyRef.current = total === 0;
  const showEmptyState = hasLoaded && isEmptyRef.current;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const currentPage = Math.floor(offset / pageSize) + 1;

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
      {error && (
        <div className="border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {/* Above the list rather than inside it, so a search that matches nothing
          still leaves the box that got there. */}
      {hasLoaded && !showEmptyState && (
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={searchInput}
            onChange={setSearchInput}
            placeholder="Search traces"
            className="w-full sm:w-3/5 sm:mr-auto"
          />
          <RefreshButton
            loading={isRefreshing}
            onClick={() => void handleRefresh()}
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setCodeOpen(true)}
          >
            View code
          </Button>
        </div>
      )}

      {!hasLoaded ? (
        <LoadingState />
      ) : showEmptyState ? (
        <TracesEmptyState agentUuid={agentUuid} onCheckForTraces={refetch} />
      ) : (
        <div className="space-y-3">
          {/* Above the no-match message too: rows ticked before the search was
              typed are still ticked, and the wait while traces load for
              labelling must not disappear either. */}
          {(selected.size > 0 || isPreparingLabelling) && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">
                {isPreparingLabelling ? (
                  "Loading traces..."
                ) : (
                  <>
                    <span className="font-medium text-foreground">
                      {selected.size}
                    </span>{" "}
                    {selected.size === 1 ? "trace" : "traces"} selected
                  </>
                )}
              </span>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => setConvertOpen(true)}
                  >
                    Add to tests ({selected.size})
                  </Button>
                  {!isPreparingLabelling && (
                    <SubmitForLabellingButton
                      count={labellableUuids.length}
                      emptyMessage={
                        selected.size > 0
                          ? "Labelling traces that only made tool calls is not supported yet."
                          : "Select at least one trace to submit for labelling."
                      }
                      onOpen={() => setEvaluatorStepOpen(true)}
                      className="inline-flex items-center h-8 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={deletion.openBulkDeleteDialog}
                    className="text-red-600 dark:text-red-400"
                  >
                    Delete selected ({selected.size})
                  </Button>
                </div>
              )}
            </div>
          )}

          {total === 0 && isSearching ? (
            <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
                <SearchIcon className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
                No traces found
              </h3>
              <p className="text-sm md:text-base text-muted-foreground text-center">
                No traces match your search
              </p>
            </div>
          ) : (
            <div className="space-y-1 pt-4">
              <ServerPaginatedListBar
                total={total}
                offset={offset}
                loadedCount={items.length}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
                currentPage={currentPage}
                pageCount={pageCount}
                onPrev={prevPage}
                onNext={nextPage}
                prevDisabled={!hasPrev || isLoading}
                nextDisabled={!hasNext || isLoading}
                itemNoun="trace"
              />

              <TracesTable
                traces={items}
                checkboxProps={deletion.checkboxProps}
                allSelected={deletion.allSelected}
                hasSelectableItems={deletion.hasSelectableItems}
                onToggleSelectAll={deletion.toggleSelectAll}
                onOpen={itemPager.open}
                onDelete={deletion.openDeleteDialog}
              />
            </div>
          )}
        </div>
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
        hasPrev={itemPager.hasPrev}
        hasNext={itemPager.hasNext}
        onPrev={itemPager.prev}
        onNext={itemPager.next}
        position={itemPager.position}
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
          // The created tests belong to this agent, so reload the Tests tab
          // and send the reader there rather than to the whole test library.
          onTestsCreated();
          toast.success(`Created ${created} test${created === 1 ? "" : "s"}`, {
            action: {
              label: "View tests",
              onClick: onViewTests,
            },
          });
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
          // The dialog stays open on its own confirmation, which is where the
          // reader opens the task or closes it, same as every other submit for
          // labelling flow. Only the ticks the submit used are cleared here.
          onAdded={clearSubmitted}
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
