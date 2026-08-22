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
import { AgentDefaultsPromptDialog } from "@/components/agent-tabs/AgentDefaultsPromptDialog";
import { SubmitForLabellingButton } from "@/components/human-labelling/labellingSubmit";
import { SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Button,
  LoadingState,
  SearchInput,
  SegmentedFilter,
  ServerPaginatedListBar,
} from "@/components/ui";
import { useAgentDefaultsPrompt } from "@/hooks/useAgentDefaultsPrompt";
import {
  useAccessToken,
  useDialogUrlParam,
  useItemPager,
  usePageSize,
  useTraceDeletion,
  useTraces,
} from "@/hooks";
import {
  fetchTrace,
  fetchTraces,
  type TraceDetail,
  type TraceOutputFilter,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/** What a trace's output can be filtered down to. A trace that both replied
 *  and called tools counts as a reply, which is also how "Add to tests"
 *  decides: one selected trace with a reply makes the whole batch judge
 *  replies. */
const OUTPUT_FILTER_OPTIONS: { value: TraceOutputFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "response", label: "Response" },
  { value: "tool_call", label: "Tool call" },
];

/**
 * The Traces tab on the agent detail page: the production conversations sent
 * in for this agent, one trace per turn. Every call is scoped to `agentUuid`.
 */
export function TracesTabContent({
  agentUuid,
  agentNature = "conversation",
  onTestsCreated,
  onViewTests,
  onAgentDefaultsAttached,
}: {
  agentUuid: string;
  /** A general agent answers one input at a time, so the sending code shows a
   * single piece of text rather than a conversation history. */
  agentNature?: "conversation" | "general";
  /** Called after traces are turned into tests, so the Tests tab reloads. */
  onTestsCreated: () => void;
  /** Opens the Tests tab, where the created tests are listed. */
  onViewTests: () => void;
  /** Called after evaluators are attached here, so the Evaluators tab reloads. */
  onAgentDefaultsAttached?: () => void;
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

  // Which kind of output to list. "response" is a trace whose agent replied,
  // "tool_call" one that only called tools. Like the search, the backend does
  // the filtering, so the count and the pages cover every matching trace and
  // not just the ones on screen.
  const [outputFilter, setOutputFilter] = useState<TraceOutputFilter>("all");

  const {
    items,
    total,
    loadedQ,
    loadedOutputType,
    offset,
    setOffset,
    loadedOffset,
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
    outputType: outputFilter,
  });

  // Every trace the list matches, not only the ticked ones. The two bulk
  // endpoints re-read the same rows from these filters, so the pages the
  // reader never loaded are included and a stale tick cannot slip through.
  const [everyTraceMatching, setEveryTraceMatching] = useState(false);
  const traceFilters = {
    agentId: agentUuid,
    q: search,
    outputType: outputFilter,
  };

  const deletion = useTraceDeletion({
    traces: items,
    onDeleted: (uuids) =>
      handleDeleted(everyTraceMatching ? total : uuids.length),
    accessToken,
    selectAll: everyTraceMatching ? traceFilters : null,
  });

  // Add selected traces as tests. A recorded response becomes a test that
  // judges what the agent produced, of the kind this agent's traces carry;
  // tool-call tests are used only when every selected trace has calls and no
  // text response.
  const isGeneral = agentNature === "general";
  const [convertOpen, setConvertOpen] = useState(false);
  const selected = deletion.selectedUuids;
  const selectedTraces = items.filter((trace) => selected.has(trace.uuid));
  // A trace either replied or only called a tool, and the two become different
  // kinds of test. One selection makes one kind, so a mix is refused rather
  // than quietly turned into the wrong thing.
  const toolCallOnlyCount = selectedTraces.filter(
    (trace) => !trace.response_preview && trace.tool_call_count > 0,
  ).length;
  const isMixedSelection =
    toolCallOnlyCount > 0 && toolCallOnlyCount < selectedTraces.length;
  const selectedTestType =
    selectedTraces.length > 0 && toolCallOnlyCount === selectedTraces.length
      ? "tool_call"
      : isGeneral
        ? "general"
        : "response";

  // A selection where every trace only made tool calls goes to an
  // `llm-tool-call` task (no evaluators, so the evaluator-picker step is
  // skipped). Any trace with a reply forces the response flow, where
  // tool-call-only traces are left out.
  const labellingIsToolCallOnly =
    selectedTraces.length > 0 &&
    selectedTraces.every(
      (trace) => !trace.response_preview?.trim() && trace.tool_call_count > 0,
    );
  const labellableTraces = labellingIsToolCallOnly
    ? selectedTraces
    : selectedTraces.filter((trace) => !!trace.response_preview?.trim());
  const labellableUuids = labellableTraces.map((trace) => trace.uuid);

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
          input:
            typeof trace.input === "string"
              ? trace.input
              : (trace.input ?? []).filter((turn) => turn.role !== "system"),
          output: trace.output,
        })),
      );
    } finally {
      setIsPreparingLabelling(false);
    }
  };

  // Evaluators picked in either flow that the agent does not have yet: the
  // same offer the Tests tab makes after a test is saved, so the next dialog
  // starts with them already ticked.
  const [defaultsLead, setDefaultsLead] = useState<string>("");
  const agentDefaults = useAgentDefaultsPrompt({
    agentUuid,
    accessToken,
    onAttached: () => onAgentDefaultsAttached?.(),
  });
  const offerAgentDefaults = (
    chosen: { uuid: string; name?: string }[],
    lead: (isOne: boolean) => string,
  ) => {
    if (chosen.length === 0) return;
    setDefaultsLead(lead(chosen.length === 1));
    void agentDefaults.promptFor(
      chosen.map((ev) => ev.uuid),
      {
        knownNames: new Map(
          chosen.flatMap((ev) => (ev.name ? [[ev.uuid, ev.name] as const] : [])),
        ),
      },
    );
  };

  const selectionCount = everyTraceMatching ? total : selected.size;
  // Which kind the whole matching list is, once it is asked for with the
  // filter on All. Null until the counts come back, "mixed" when both kinds
  // are in there. The counts are two cheap reads: a page of one row each,
  // whose total is what is wanted.
  const [wholeListKind, setWholeListKind] = useState<
    "response" | "tool_call" | "mixed" | null
  >(null);
  const [isCheckingKinds, setIsCheckingKinds] = useState(false);
  const wholeListKindOf = async (): Promise<
    "response" | "tool_call" | "mixed" | null
  > => {
    if (!accessToken) return null;
    if (wholeListKind) return wholeListKind;
    setIsCheckingKinds(true);
    try {
      const [replies, toolCalls] = await Promise.all(
        (["response", "tool_call"] as const).map((outputType) =>
          fetchTraces(accessToken, {
            limit: 1,
            offset: 0,
            agentId: agentUuid,
            q: search,
            outputType,
          }),
        ),
      );
      const kind =
        replies.total > 0 && toolCalls.total > 0
          ? "mixed"
          : toolCalls.total > 0
            ? "tool_call"
            : "response";
      setWholeListKind(kind);
      return kind;
    } catch (err) {
      reportError("Error counting the kinds of trace:", err);
      toast.error("Could not read the traces. Please try again.");
      return null;
    } finally {
      setIsCheckingKinds(false);
    }
  };
  // Offered once everything on show is ticked and there are more pages behind
  // it. Deleting and adding to tests then work on the whole matching list.
  const canSelectEveryTrace =
    deletion.allSelected &&
    items.length > 0 &&
    !everyTraceMatching &&
    total > items.length;

  // The choice was made against one list, so a new search or filter drops it
  // rather than acting on rows the reader never saw.
  useEffect(() => {
    setEveryTraceMatching(false);
    setWholeListKind(null);
  }, [search, outputFilter]);
  // Unticking a row is the reader narrowing what they want, so the whole list
  // is no longer what they asked for.
  useEffect(() => {
    if (!deletion.allSelected) setEveryTraceMatching(false);
  }, [deletion.allSelected]);

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
    // A refresh can bring in traces of the other kind, which the counts read
    // before it would not know about.
    setWholeListKind(null);
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
    pageStart: loadedOffset,
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
  // A chosen output kind counts the same way: once one is on, an empty list can
  // no longer mean "this agent never sent a trace". Both the chosen value and
  // the one the rows came from count, because after the filter is set back to
  // All the rows on screen are still the filtered ones until the full list has
  // loaded back.
  const isFilteringOutput =
    outputFilter !== "all" || loadedOutputType !== "all";
  const isNarrowed = isSearching || isFilteringOutput;
  const noMatchMessage =
    isSearching && isFilteringOutput
      ? "No traces match your search and filter"
      : isSearching
        ? "No traces match your search"
        : "No traces match your filter";
  const isEmptyRef = useRef(false);
  if (!isLoading && !error && !isNarrowed) isEmptyRef.current = total === 0;
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
            className="w-full sm:w-2/5"
          />
          <SegmentedFilter
            value={outputFilter}
            onChange={setOutputFilter}
            options={OUTPUT_FILTER_OPTIONS}
            className="sm:mr-auto"
            ariaLabel="Filter traces by output"
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
        <TracesEmptyState
          agentUuid={agentUuid}
          agentNature={agentNature}
          onCheckForTraces={refetch}
        />
      ) : (
        <div className="space-y-3">
          {/* Above the no-match message too: rows ticked before the search was
              typed are still ticked, and the wait while traces load for
              labelling must not disappear either. */}
          {(selected.size > 0 || isPreparingLabelling) && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
              {/* The count and the offer to take the whole list belong
                  together on the left; only the actions go to the right. */}
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-sm text-muted-foreground">
                  {isPreparingLabelling ? (
                    "Loading traces..."
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {selectionCount}
                      </span>{" "}
                      {selectionCount === 1 ? "trace" : "traces"} selected
                      {everyTraceMatching && search.trim() ? (
                        <span className="opacity-80">
                          {" "}
                          matching &ldquo;{search.trim()}&rdquo;
                        </span>
                      ) : null}
                    </>
                  )}
                </span>
                {canSelectEveryTrace && (
                  <button
                    type="button"
                    onClick={() => setEveryTraceMatching(true)}
                    className="inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    Select all {total} trace{total === 1 ? "" : "s"}
                    {search.trim() ? ` matching "${search.trim()}"` : ""}
                  </button>
                )}
              </div>
              {selected.size > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={isCheckingKinds}
                    onClick={async () => {
                      if (!everyTraceMatching) {
                        if (isMixedSelection) {
                          toast.error(
                            "The selected traces contains a mix of responses and tool calls. Select all traces having the same type of output at a time to add them as a group.",
                          );
                          return;
                        }
                        setConvertOpen(true);
                        return;
                      }
                      // The pages behind this one are unread, so the backend
                      // says what kinds they hold before anything is made.
                      const kind =
                        outputFilter === "all"
                          ? await wholeListKindOf()
                          : outputFilter;
                      if (!kind) return;
                      if (kind === "mixed") {
                        toast.error(
                          "The selected traces contains a mix of responses and tool calls. Select all traces having the same type of output at a time to add them as a group.",
                        );
                        return;
                      }
                      setConvertOpen(true);
                    }}
                  >
                    Add to tests ({selectionCount})
                  </Button>
                  {!isPreparingLabelling && (
                    <SubmitForLabellingButton
                      count={everyTraceMatching ? 0 : labellableUuids.length}
                      emptyMessage={
                        everyTraceMatching
                          ? "Labelling works on the traces you tick. Untick the whole list and pick the ones to send."
                          : "Select at least one trace to submit for labelling."
                      }
                      onOpen={() =>
                        labellingIsToolCallOnly
                          ? prepareLabelling([])
                          : setEvaluatorStepOpen(true)
                      }
                      className="inline-flex items-center h-8 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={deletion.openBulkDeleteDialog}
                    className="text-red-600 dark:text-red-400"
                  >
                    Delete selected ({selectionCount})
                  </Button>
                </div>
              )}
            </div>
          )}

          {total === 0 && isNarrowed ? (
            <div className="border border-border rounded-xl p-8 md:p-12 flex flex-col items-center justify-center bg-muted/20">
              <div className="w-12 h-12 md:w-14 md:h-14 rounded-xl bg-muted flex items-center justify-center mb-3 md:mb-4">
                <SearchIcon className="w-6 h-6 md:w-7 md:h-7 text-muted-foreground" />
              </div>
              <h3 className="text-base md:text-lg font-semibold text-foreground mb-1">
                No traces found
              </h3>
              <p className="text-sm md:text-base text-muted-foreground text-center">
                {noMatchMessage}
              </p>
            </div>
          ) : (
            <div className="space-y-1 pt-1">
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
        agentNature={agentNature}
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
        selectAll={
          everyTraceMatching
            ? {
                ...traceFilters,
                // Only one kind of test is made per call, so an unfiltered
                // list is pinned to the kind the counts found.
                outputType:
                  outputFilter === "all" && wholeListKind !== "mixed"
                    ? (wholeListKind ?? "all")
                    : outputFilter,
              }
            : null
        }
        traceCount={selectionCount}
        testType={
          everyTraceMatching
            ? (outputFilter === "all" ? wholeListKind : outputFilter) ===
              "tool_call"
              ? "tool_call"
              : isGeneral
                ? "general"
                : "response"
            : selectedTestType
        }
        agentUuid={agentUuid}
        agentNature={agentNature}
        onConverted={(result, evaluatorsUsed = []) => {
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
          offerAgentDefaults(evaluatorsUsed, (isOne) =>
            created === 1
              ? `The test you just added uses ${isOne ? "an evaluator" : "evaluators"} that ${isOne ? "is" : "are"} not yet attached to this agent.`
              : `The tests you just added use ${isOne ? "an evaluator" : "evaluators"} that ${isOne ? "is" : "are"} not yet attached to this agent.`,
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
          agentNature={agentNature}
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
            agentNature,
          }}
          // The dialog stays open on its own confirmation, which is where the
          // reader opens the task or closes it, same as every other submit for
          // labelling flow. Only the ticks the submit used are cleared here.
          onAdded={() => {
            clearSubmitted();
            offerAgentDefaults(labellingEvaluators, (isOne) =>
              `The traces you just sent for labelling are scored against ${isOne ? "an evaluator" : "evaluators"} that ${isOne ? "is" : "are"} not yet attached to this agent.`,
            );
          }}
        />
      )}

      {agentDefaults.prompt && agentDefaults.prompt.length > 0 && (
        <AgentDefaultsPromptDialog
          evaluators={agentDefaults.prompt}
          lead={defaultsLead}
          savedNote="The work itself went through. Try again below, or choose Not now to skip."
          isSaving={agentDefaults.isSaving}
          error={agentDefaults.error}
          onDismiss={agentDefaults.dismiss}
          onConfirm={agentDefaults.confirm}
        />
      )}

      <DeleteConfirmationDialog
        isOpen={deletion.deleteDialogOpen}
        onClose={deletion.closeDeleteDialog}
        onConfirm={deletion.deleteItems}
        title={
          deletion.itemsToDeleteBulk.length > 0
            ? `Delete ${selectionCount} trace${selectionCount === 1 ? "" : "s"}?`
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
