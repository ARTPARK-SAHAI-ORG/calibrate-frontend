"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { TracesTable } from "@/components/traces/TracesTable";
import type { TraceScoreColumn } from "@/components/traces/TraceScoringSummary";
import { TraceDetailDialog } from "@/components/traces/TraceDetailDialog";
import { TracesEmptyState } from "@/components/traces/TracesEmptyState";
import { AddedToTestsDialog } from "@/components/traces/AddedToTestsDialog";
import { ConvertTracesToTestsDialog } from "@/components/traces/ConvertTracesToTestsDialog";
import {
  TraceLabellingEvaluatorsDialog,
  type TraceEvaluatorVariables,
} from "@/components/traces/TraceLabellingEvaluatorsDialog";
import { TraceIngestCodeDialog } from "@/components/traces/TraceIngestCodeDialog";
import {
  EvaluatorsTabLink,
  NothingCanScoreMessage,
} from "@/components/traces/NothingCanScoreMessage";
import { AddToolCallEvaluatorButton } from "@/components/traces/AddToolCallEvaluatorButton";
import { useConfigureTraceValues } from "@/components/traces/useConfigureTraceValues";
import { TraceScoringChip } from "@/components/traces/TraceScoringChip";
import {
  AddRunToLabellingTaskDialog,
  isLabellableOutput,
  type SourceEvaluatorRef,
  type TraceLabellingItem,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { AgentDefaultsPromptDialog } from "@/components/agent-tabs/AgentDefaultsPromptDialog";
import {
  SubmitForLabellingButton,
  SUBMIT_FOR_LABELLING_CLASS,
} from "@/components/human-labelling/labellingSubmit";
import {
  TracesFilter,
  traceFilterCount,
  type TraceScoreFilterEvaluator,
} from "@/components/traces/TracesFilter";
import { TracesSort } from "@/components/traces/TracesSort";
import { ConversationsView } from "@/components/traces/ConversationsView";
import { useTraceView } from "@/components/traces/traceViewUrl";
import { CodeIcon, SearchIcon } from "@/components/icons";
import { RefreshButton } from "@/components/RefreshButton";
import {
  Button,
  ErrorNote,
  LoadingState,
  SearchInput,
  SegmentedFilter,
  ServerPaginatedListBar,
} from "@/components/ui";
import { useAgentDefaultsPrompt } from "@/hooks/useAgentDefaultsPrompt";
import {
  useAccessToken,
  useActiveOrgUuid,
  useDialogUrlParam,
  useItemPager,
  usePageSize,
  useTraceConversationIds,
  useTraceDeletion,
  useTraceLabels,
  useTraces,
} from "@/hooks";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";
import { ExtendLimitsLink } from "@/constants/limits";
import { fetchAgentEvaluators } from "@/lib/evaluatorApi";
import type { EvaluatorType } from "@/components/EvaluatorPills";
import {
  EVERY_EVALUATOR_NEEDS_VALUES,
  everyEvaluatorNeedsValues,
  isToolCallTraceRow,
  traceRowOutputFacts,
} from "@/lib/traceScoring";
import { evaluatorFitsItem } from "@/lib/labellingItem";
import { EvaluatorScoreCards } from "@/components/human-labelling/EvaluatorScoreCards";
import { formatEvaluatorResultStat } from "@/lib/evaluatorResultStat";
import {
  fetchTrace,
  fetchHasTrace,
  fetchTraceUsage,
  fetchTraces,
  traceFilterKey,
  type TraceUsage,
  type TraceDetail,
  traceToLabellingItem,
  type TraceSummary,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";
import { fetchChatLink, type ChatLink } from "@/lib/chatLinkApi";
import { WarningBox } from "@/components/traces/WarningBox";

const MIXED_SELECTION_ERROR =
  "The selected traces contain a mix of responses and tool calls. Select all traces having the same type of output at a time to add them as a group.";

/**
 * A number of traces, said the way a person says it: "1 trace", "50,000
 * traces". Both limit lines use it so neither can end up with "1 traces".
 */
function traceCount(n: number): string {
  return `${n.toLocaleString()} trace${n === 1 ? "" : "s"}`;
}

/**
 * The Monitoring tab on the agent detail page: the production conversations sent
 * in for this agent, one trace per turn. Every call is scoped to `agentUuid`.
 */
export function TracesTabContent({
  agentUuid,
  agentNature = "conversation",
  traceScoring,
  onGoToEvaluators,
  onGoToSettings,
  isActive = true,
  onTestsCreated,
  onAgentDefaultsAttached,
}: {
  agentUuid: string;
  /** A general agent answers one input at a time, so the sending code shows a
   * single piece of text rather than a conversation history. */
  agentNature?: "conversation" | "general";
  /** Automatic scoring of new traces: on or off, and which evaluators can do it. */
  traceScoring: TraceScoringControls;
  /** Opens the Evaluators tab, where the set that scores traces is chosen. */
  onGoToEvaluators: () => void;
  /** Opens the Settings tab, where the agent's replies per day are set. */
  onGoToSettings: () => void;
  /** The traces tab is on screen. Polling pauses when this is false. */
  isActive?: boolean;
  /** Called after traces are turned into tests, so the Tests tab reloads. */
  onTestsCreated: () => void;
  /** Called after evaluators are attached or configured here, so the
   * Evaluators tab reloads. */
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
  // The filters and the sort live in the address bar, so a reload or a
  // shared link keeps the same view. `tab` and `traceId` are left alone.
  const [view, setView] = useTraceView();
  const {
    sortByEvaluator,
    sortOrder,
    conversations: showConversations,
    ...facets
  } = view;
  const listFilters = { agentId: agentUuid, q: search, ...facets };

  // The tags sent with the traces, and the ones picked to filter by. A trace
  // matches when it carries any of the picked ones. The whole set comes from
  // the backend, since one page of rows is never all of them.
  const { labels: allLabels, refetch: refetchLabels } = useTraceLabels(
    accessToken,
    agentUuid,
  );
  const { conversationIds, refetch: refetchConversationIds } =
    useTraceConversationIds(accessToken, agentUuid);

  // One condition per evaluator, all of which have to hold. They are picked
  // in the same panel as the output kind and the labels, and applied with
  // them. Clicking an evaluator column orders the list by its scores, lowest
  // first, which is where the poor answers are and what every other sortable
  // table here does; clicking it again turns the order round, and once more
  // goes back to newest first.
  const sortByEvaluatorScore = (evaluatorUuid: string) => {
    if (sortByEvaluator !== evaluatorUuid) {
      setView({ sortByEvaluator: evaluatorUuid, sortOrder: "asc" });
      return;
    }
    if (sortOrder === "asc") {
      setView({ sortOrder: "desc" });
      return;
    }
    setView({ sortByEvaluator: null, sortOrder: "asc" });
  };

  const {
    items,
    total,
    loadedFilters,
    scoreAverages,
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
    pageSize,
    ...listFilters,
    sortByEvaluator,
    sortOrder,
    poll: isActive && !showConversations,
  });

  // Every trace the list matches, not only the ticked ones. The two bulk
  // endpoints re-read the same rows from these filters, so the pages the
  // reader never loaded are included and a stale tick cannot slip through.
  // The moment they asked for it. Both endpoints stop at this time, so a trace
  // that lands after the reader chose is left alone.
  // ponytail: the browser's clock. One running slow leaves the newest traces
  // out rather than taking in unseen ones; use a backend time if that matters.
  const [everyTraceMatchingSince, setEveryTraceMatchingSince] = useState<
    string | null
  >(null);
  const everyTraceMatching = everyTraceMatchingSince !== null;
  const selectAllFilters = {
    ...listFilters,
    createdBefore: everyTraceMatchingSince,
  };

  // Refresh bumps this, since the chat link's count moves during the day. A
  // delete bumps it too, since it can remove the last trace of a kind.
  const [usageReads, setUsageReads] = useState(0);

  const deletion = useTraceDeletion({
    traces: items,
    onDeleted: (uuids) => {
      handleDeleted(everyTraceMatching ? total : uuids.length);
      setUsageReads((n) => n + 1);
    },
    accessToken,
    selectAll: everyTraceMatching ? selectAllFilters : null,
  });

  // Add selected traces as tests. A recorded response becomes a test that
  // judges what the agent produced, of the kind this agent's traces carry;
  // tool-call tests are used only when every selected trace has calls and no
  // text response.
  const isGeneral = agentNature === "general";
  const [convertOpen, setConvertOpen] = useState(false);
  const selected = deletion.selectedUuids;
  // A tick survives the reader turning the page, but the row behind it does
  // not, so every ticked trace is held here as it is ticked. What follows then
  // reads all of them and not only the ones on the page in front of the reader.
  const pickedRef = useRef(new Map<string, TraceSummary>());
  items.forEach((trace) => {
    if (selected.has(trace.uuid)) pickedRef.current.set(trace.uuid, trace);
    else pickedRef.current.delete(trace.uuid);
  });
  const selectedTraces = Array.from(selected).flatMap((uuid) => {
    const trace = pickedRef.current.get(uuid);
    return trace ? [trace] : [];
  });
  // A trace either replied or only called a tool, and the two become different
  // kinds of test. One selection makes one kind, so a mix is refused rather
  // than quietly turned into the wrong thing.
  const toolCallOnlyCount = selectedTraces.filter(isToolCallTraceRow).length;
  const isMixedSelection =
    toolCallOnlyCount > 0 && toolCallOnlyCount < selectedTraces.length;
  const selectedTestType =
    selectedTraces.length > 0 && toolCallOnlyCount === selectedTraces.length
      ? "tool_call"
      : isGeneral
        ? "general"
        : "response";

  // What a row can be labelled as is decided by the same rule the labelling
  // dialog uses, fed from the preview and the count the list row carries. Both
  // sides deciding through one rule is what keeps the count on the button and
  // what the dialog builds in step with each other.
  const labellableTraces = selectedTraces.filter((trace) =>
    isLabellableOutput(traceRowOutputFacts(trace)),
  );
  const labellableUuids = labellableTraces.map((trace) => trace.uuid);
  // How a trace is named in the evaluator windows: what the user said.
  const traceLabel = (trace: TraceSummary) =>
    trace.input_preview || trace.uuid;
  // A selection that is nothing but tool calls skips the evaluator step: a
  // tool-call row is answered only against the tool-call evaluator, so there
  // is nothing to pick.
  const labellingIsToolCallOnly =
    labellableTraces.length > 0 && labellableTraces.every(isToolCallTraceRow);
  // A tool-call item carries no evaluator values, so only the rest are read
  // and checked for them.
  const replyTraces = labellableTraces.filter(
    (trace) => !isToolCallTraceRow(trace),
  );

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

  // The ticks can change while the traces are loading, so the set the submit
  // started from is what the check afterwards compares against.
  const labellableRef = useRef(labellableUuids);
  labellableRef.current = labellableUuids;

  const prepareLabelling = async (
    chosen: SourceEvaluatorRef[],
    variables: TraceEvaluatorVariables,
  ) => {
    setEvaluatorStepOpen(false);
    if (!accessToken) return;
    const uuids = labellableRef.current;
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
        loaded.map((trace) =>
          traceToLabellingItem(trace, variables[trace.uuid]),
        ),
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
  const [orgUuid] = useActiveOrgUuid();
  // The tests just added, for the confirmation window, and the offer to add
  // their evaluators to the agent, which waits until that window closes.
  const [addedTests, setAddedTests] = useState<string[] | null>(null);
  const afterAdded = useRef<(() => void) | null>(null);
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
          chosen.flatMap((ev) =>
            ev.name ? [[ev.uuid, ev.name] as const] : [],
          ),
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
  // Bumped whenever the list the reader is looking at changes. The counts
  // below take a round trip, and a filter changed while they are in flight
  // makes their answer one about a list nobody is looking at any more.
  const listVersionRef = useRef(0);
  const wholeListKindOf = async (): Promise<
    "response" | "tool_call" | "mixed" | null
  > => {
    if (!accessToken) return null;
    if (wholeListKind) return wholeListKind;
    const listVersion = listVersionRef.current;
    setIsCheckingKinds(true);
    try {
      const [replies, toolCalls] = await Promise.all(
        (["response", "tool_call"] as const).map((outputType) =>
          fetchTraces(accessToken, {
            ...selectAllFilters,
            limit: 1,
            offset: 0,
            outputType,
          }),
        ),
      );
      if (listVersion !== listVersionRef.current) return null;
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
  // Ticks are dropped with it: they are kept across pages, but a trace the
  // list no longer matches cannot be seen on screen, so it must not stay in
  // what the next action works on.
  useEffect(() => {
    listVersionRef.current += 1;
    setEveryTraceMatchingSince(null);
    setWholeListKind(null);
    pickedRef.current.clear();
    deletion.clearSelection();
    // Not the sort: ordering the list changes what is on the page in front of
    // the reader, never which traces the list matches, so a tick survives it
    // the same way it survives a page turn. Not `everyTraceMatchingSince`
    // either: choosing select all sets it, and that must not clear the choice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traceFilterKey(listFilters)]);
  // Unticking a row is the reader narrowing what they want, so the whole list
  // is no longer what they asked for.
  useEffect(() => {
    if (!deletion.allSelected) setEveryTraceMatchingSince(null);
  }, [deletion.allSelected]);

  // The setup steps go away once the first trace lands, so the code that sends
  // one stays reachable from here: to add another service, or to check a field.
  const [integrationGuideOpen, setIntegrationGuideOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const ineligible = traceScoring.eligibility?.ineligible ?? [];
  const eligibility = traceScoring.eligibility;
  const nothingCanScore =
    eligibility !== null && eligibility.eligible.length === 0;
  const needValues = ineligible.filter(
    (item) => item.reason === "declares_variables",
  );
  // Setting up an evaluator's variables can link it to the agent and lets it
  // score, so the scoring state and the agent's evaluators are read again.
  const afterEvaluatorSetUp = () => {
    void traceScoring.refreshEligibility();
    onAgentDefaultsAttached?.();
  };
  const configureTraceValues = useConfigureTraceValues({
    agentUuid,
    agentNature,
    accessToken,
    onRefresh: afterEvaluatorSetUp,
  });
  // What each column's evaluator judges, so a row it does not apply to reads
  // as empty rather than as waiting. Filled with the descriptions below.
  // Null until a read succeeds. A failed re-read keeps the last known types,
  // so cells and notes do not change on a passing error.
  const [evaluatorTypes, setEvaluatorTypes] = useState<Record<
    string,
    EvaluatorType
  > | null>(null);
  // True during every read, the first and each one after. An evaluator linked
  // since the last read has no type yet, so its cells wait for this one.
  const [evaluatorTypesReading, setEvaluatorTypesReading] = useState(true);
  // Every evaluator still on the agent, whether or not it can score. Null
  // until the eligibility is read.
  const eligibilityIds = useMemo(
    () =>
      eligibility
        ? new Set(
            [...eligibility.eligible, ...eligibility.ineligible].map(
              (item) => item.evaluator_uuid,
            ),
          )
        : null,
    [eligibility],
  );
  // Nothing passes until the eligibility is read, so a removed evaluator never
  // shows in the meantime; everything passes if that read failed, so the scores
  // do not all vanish with it.
  const eligibilityFailed = traceScoring.eligibilityError !== null;
  const isLinkedEvaluator = useCallback(
    (evaluatorUuid: string) =>
      eligibilityIds ? eligibilityIds.has(evaluatorUuid) : eligibilityFailed,
    [eligibilityIds, eligibilityFailed],
  );
  // One column per evaluator that can score now, plus any other evaluator on
  // the agent that scored a trace on this page. An evaluator taken off the
  // agent loses its column; its scores stay in each trace's own window.
  const scoreColumns = useMemo(() => {
    const byId = new Map<string, TraceScoreColumn>();
    const add = (evaluator_uuid: string, name: string) => {
      if (byId.has(evaluator_uuid)) return;
      byId.set(evaluator_uuid, {
        evaluator_uuid,
        name,
        evaluator_type:
          evaluatorTypes?.[evaluator_uuid] ??
          (evaluatorTypesReading ? null : undefined),
      });
    };
    for (const item of eligibility?.eligible ?? []) {
      add(item.evaluator_uuid, item.name);
    }
    for (const trace of items) {
      for (const result of trace.results ?? []) {
        if (isLinkedEvaluator(result.evaluator_uuid)) {
          add(result.evaluator_uuid, result.name);
        }
      }
    }
    return [...byId.values()];
  }, [
    eligibility,
    isLinkedEvaluator,
    items,
    evaluatorTypes,
    evaluatorTypesReading,
  ]);
  // An evaluator taken off the agent takes its heading away with it, and with
  // no heading there is nothing left on screen to turn its ordering off.
  useEffect(() => {
    if (!sortByEvaluator) return;
    // Not before both the evaluator list AND the first page of traces are in:
    // a column is drawn for an evaluator that merely scored a row on the page,
    // so judging "this has no column" on either one alone throws away a sort
    // restored from the address.
    if (!eligibility || isLoading) return;
    if (scoreColumns.some((c) => c.evaluator_uuid === sortByEvaluator)) return;
    setView({ sortByEvaluator: null });
  }, [eligibility, isLoading, scoreColumns, sortByEvaluator, setView]);
  // How each evaluator judges, so a rating can be filtered by its own numbers
  // rather than only by a verdict. Remembered for as long as the tab is open,
  // because both places it can be read from, the running averages and the
  // scores on the page, describe only the traces the filters match: a filter
  // matching none of an evaluator's own traces would otherwise take its scale
  // away, turn its picker back into a verdict, and leave the condition the
  // reader already picked missing from the list, showing an empty box.
  const knownEvaluatorsRef = useRef(
    new Map<string, TraceScoreFilterEvaluator>(),
  );
  const knownEvaluators = knownEvaluatorsRef.current;
  const rememberEvaluator = (next: TraceScoreFilterEvaluator) => {
    const held = knownEvaluators.get(next.evaluator_uuid);
    knownEvaluators.set(next.evaluator_uuid, {
      ...held,
      ...next,
      // A name is always current; a scale, once known, is never unlearned.
      output_type: next.output_type ?? held?.output_type ?? null,
      scale_min: next.scale_min ?? held?.scale_min ?? null,
      scale_max: next.scale_max ?? held?.scale_max ?? null,
    });
  };
  scoreColumns.forEach(rememberEvaluator);
  for (const average of scoreAverages) rememberEvaluator(average);
  for (const trace of items) {
    for (const result of trace.results ?? []) rememberEvaluator(result);
  }
  const scoreFilterEvaluators: TraceScoreFilterEvaluator[] = useMemo(() => {
    const ids = new Set([
      ...scoreColumns.map((column) => column.evaluator_uuid),
      // An evaluator whose column has gone keeps its picker while its own
      // condition is still narrowing the list, or the filter is on with
      // nothing on screen able to turn it off.
      ...Object.keys(facets.scores),
    ]);
    return [...ids].flatMap((uuid) => knownEvaluators.get(uuid) ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scoreColumns, facets.scores, scoreAverages, items]);
  // A trace's scores name each evaluator but not what it judges, so the words
  // come from the agent's own evaluator list.
  const [evaluatorDescriptions, setEvaluatorDescriptions] = useState<
    Record<string, string>
  >({});
  const [evaluatorsReloadKey, setEvaluatorsReloadKey] = useState(0);
  const [toolCallPickerOpen, setToolCallPickerOpen] = useState(false);
  // Read again each time the tab comes back on screen, the same moment the
  // scoring eligibility is read again, so an evaluator linked meanwhile has a
  // type for its column.
  useEffect(() => {
    if (!accessToken || !isActive) return;
    let cancelled = false;
    setEvaluatorTypesReading(true);
    fetchAgentEvaluators(agentUuid, accessToken)
      .then((list) => {
        if (cancelled) return;
        const byId: Record<string, string> = {};
        const typeById: Record<string, EvaluatorType> = {};
        for (const item of list) {
          if (item.description) byId[item.uuid] = item.description;
          if (item.evaluator_type) typeById[item.uuid] = item.evaluator_type;
        }
        setEvaluatorDescriptions(byId);
        setEvaluatorTypes(typeById);
      })
      .catch((err) => reportError("Error fetching agent evaluators:", err))
      .finally(() => {
        if (!cancelled) setEvaluatorTypesReading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentUuid, accessToken, isActive, evaluatorsReloadKey]);

  // Whether any trace, not only one on this page, is nothing but tool calls.
  const [hasStoredToolCallTrace, setHasStoredToolCallTrace] = useState(false);
  const [hasStoredReplyTrace, setHasStoredReplyTrace] = useState(false);
  const hasToolCallTrace =
    hasStoredToolCallTrace || items.some(isToolCallTraceRow);
  const hasReplyTrace =
    hasStoredReplyTrace ||
    items.some((trace) => traceRowOutputFacts(trace).hasResponse);
  const linkedTypes = evaluatorTypes ? Object.values(evaluatorTypes) : null;
  // The evaluator list and the eligibility are read separately, so one can
  // arrive before the other. Null until both name the same evaluators.
  const scoringTypes =
    eligibility &&
    evaluatorTypes &&
    Object.keys(evaluatorTypes).every((id) => eligibilityIds?.has(id))
      ? eligibility.eligible.map((item) => evaluatorTypes[item.evaluator_uuid])
      : null;
  const knownScoringTypes = scoringTypes?.every(Boolean) ? scoringTypes : null;
  // Matches the backend, which says a tool call trace was skipped for having
  // no tool call evaluator only when none is linked at all.
  const missingToolCallEvaluator =
    linkedTypes !== null &&
    hasToolCallTrace &&
    !linkedTypes.includes("tool-call");
  const toolCallEvaluatorCannotScore =
    knownScoringTypes !== null &&
    hasToolCallTrace &&
    !!linkedTypes?.includes("tool-call") &&
    !knownScoringTypes.includes("tool-call");
  const outputsWord = isGeneral ? "outputs" : "responses";
  const onlyToolCallEvaluators =
    knownScoringTypes !== null &&
    knownScoringTypes.length > 0 &&
    knownScoringTypes.every((type) => type === "tool-call") &&
    hasReplyTrace;
  const addToolCallEvaluatorButton = (asButton = false) => (
    <AddToolCallEvaluatorButton
      asButton={asButton}
      agentUuid={agentUuid}
      accessToken={accessToken}
      onAdded={() => {
        setEvaluatorsReloadKey((key) => key + 1);
        void traceScoring.refreshEligibility();
        onAgentDefaultsAttached?.();
      }}
      onOpenChange={setToolCallPickerOpen}
    />
  );

  // The backend's own averages over every matching trace, not the page, for
  // the evaluators still on the agent.
  const scoreCards = useMemo(
    () =>
      scoreAverages
        .filter((average) => isLinkedEvaluator(average.evaluator_uuid))
        .map((average) => ({
          evaluatorId: average.evaluator_uuid,
          name: average.name,
          stat: formatEvaluatorResultStat(
            average.output_type === "rating"
              ? { count: average.traces_scored, mean: average.average }
              : {
                  count: average.traces_scored,
                  // A yes-or-no evaluator averages ones and zeros, so its
                  // average is the share that passed.
                  trueCount: Math.round(
                    average.average * average.traces_scored,
                  ),
                },
            {
              output_type: average.output_type,
              scale_min: average.scale_min,
              scale_max: average.scale_max,
            },
            "item",
          ),
        })),
    [scoreAverages, isLinkedEvaluator],
  );

  // Read on every visit, because the storage limit leaves no trace of itself
  // here: past it the backend turns down the customer's own app, that app
  // logs the refusal on its own server, and this tab just looks like a quiet
  // day. The scoring limit's own number comes from the same answer.
  const [usage, setUsage] = useState<TraceUsage | null>(null);
  // Today's chat messages against this agent's own daily limit.
  const [chatLink, setChatLink] = useState<ChatLink | null>(null);
  // Whether any of the agent's traces carries feedback from the chat link,
  // which is what puts the feedback section in the filter.
  const [hasFeedback, setHasFeedback] = useState(false);
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    fetchTraceUsage(accessToken)
      .then((next) => {
        if (!cancelled) setUsage(next);
      })
      .catch((err) => reportError("Error fetching trace usage:", err));
    fetchChatLink(accessToken, agentUuid)
      .then((next) => {
        if (!cancelled) setChatLink(next);
      })
      .catch((err) => reportError("Error fetching the chat link:", err));
    fetchHasTrace(accessToken, agentUuid, { feedback: "any" })
      .then((has) => {
        if (!cancelled) setHasFeedback(has);
      })
      .catch((err) => reportError("Error checking for trace feedback:", err));
    fetchHasTrace(accessToken, agentUuid, { outputType: "tool_call" })
      .then((has) => {
        if (!cancelled) setHasStoredToolCallTrace(has);
      })
      .catch((err) => reportError("Error checking for tool call traces:", err));
    fetchHasTrace(accessToken, agentUuid, { outputType: "response" })
      .then((has) => {
        if (!cancelled) setHasStoredReplyTrace(has);
      })
      .catch((err) => reportError("Error checking for reply traces:", err));
    return () => {
      cancelled = true;
    };
  }, [accessToken, agentUuid, usageReads]);
  // A row on the page with feedback counts too, so feedback that arrives
  // while the tab is open shows the section without a Refresh.
  const anyFeedback = hasFeedback || items.some((t) => t.feedback);
  // Rows skipped before the workspace's limit was lifted still say over_limit.
  const overLimit =
    usage?.max_scored_traces !== null &&
    items.some((t) => t.latest_run_error === "over_limit");
  const storageFull = usage != null && usage.traces_stored >= usage.max_traces;
  const isScoringLive = traceScoring.enabled && !overLimit && !storageFull;
  // Scoring a stored trace again uses a scoring slot but no storage.
  const scoredTracesFull =
    usage?.max_scored_traces != null &&
    usage.traces_scored >= usage.max_scored_traces;
  const chatReplyCap = chatLink?.daily_message_limit ?? null;
  const chatLimitReached =
    chatReplyCap !== null && chatLink!.messages_today >= chatReplyCap;

  const handleRefresh = async () => {
    // A refresh can bring in traces of the other kind, which the counts read
    // before it would not know about.
    setWholeListKind(null);
    setIsRefreshing(true);
    try {
      // New traces can carry labels nothing has seen yet, so the filter's
      // choices are read again with them.
      refetchLabels();
      refetchConversationIds();
      setUsageReads((n) => n + 1);
      await refetch();
    } finally {
      setIsRefreshing(false);
    }
  };

  const [openTraceUuid, setOpenTraceUuid] = useState<string | null>(null);
  const { setParam: setTraceParam } = useDialogUrlParam({
    param: "traceId",
    onOpen: (value) => setOpenTraceUuid(value),
    onClose: () => {
      itemPager.cancel();
      setOpenTraceUuid(null);
    },
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
  // The trace on show, so it can be ticked from inside the dialog rather than
  // closing it and finding the row again.
  const openTraceItem = items.find((item) => item.uuid === openTraceUuid);
  const openTraceIsToolCall =
    !!openTraceItem && isToolCallTraceRow(openTraceItem);
  // Only the evaluators that could have scored the open trace's kind of output.
  // A type not read yet is kept, since nothing says it does not fit.
  const ineligibleForOpenTrace =
    openTraceItem && evaluatorTypes
      ? ineligible.filter(
          (item) =>
            !evaluatorTypes[item.evaluator_uuid] ||
            evaluatorFitsItem(
              evaluatorTypes[item.evaluator_uuid],
              openTraceIsToolCall,
            ),
        )
      : ineligible;
  // The agent's evaluators that fit the open trace's kind of output. A type
  // not read yet must not count, since an unknown type fits a reply. A trace
  // not on this page, or one seen before the kinds are read, has no known
  // fit, so every evaluator that can score is named; the backend skips it
  // again if none fits.
  const eligibleEvaluators = eligibility?.eligible ?? [];
  const scoringForOpenTrace =
    openTraceItem && evaluatorTypes
      ? eligibleEvaluators.filter(
          (item) =>
            !!evaluatorTypes[item.evaluator_uuid] &&
            evaluatorFitsItem(
              evaluatorTypes[item.evaluator_uuid],
              openTraceIsToolCall,
            ),
        )
      : eligibleEvaluators;
  const scoringNamesForOpenTrace = scoringForOpenTrace.map((item) => item.name);
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
    searchInput.trim() !== "" ||
    search.trim() !== "" ||
    loadedFilters.q.trim() !== "";
  // A chosen filter counts the same way: once one is on, an empty list can no
  // longer mean "this agent never sent a trace". Both the chosen filters and
  // the ones the rows came from count, because after a filter is cleared the
  // rows on screen are still the filtered ones until the full list has loaded
  // back.
  const isFiltering =
    traceFilterCount(facets) > 0 || traceFilterCount(loadedFilters) > 0;
  const isNarrowed = isSearching || isFiltering;
  const noMatchMessage =
    isSearching && isFiltering
      ? "No traces match your search and filter"
      : isSearching
        ? "No traces match your search"
        : "No traces match your filter";
  const isEmptyRef = useRef(false);
  if (!isLoading && !error && !isNarrowed) isEmptyRef.current = total === 0;
  const showEmptyState = hasLoaded && isEmptyRef.current;
  const pageCount = pageSize > 0 ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const currentPage = Math.floor(offset / pageSize) + 1;

  const scoringBlocked = traceScoring.enabled && nothingCanScore;
  const hasWarning =
    scoringBlocked ||
    overLimit ||
    missingToolCallEvaluator ||
    toolCallEvaluatorCannotScore ||
    onlyToolCallEvaluators;

  const integrationGuideButton = (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => setIntegrationGuideOpen(true)}
    >
      <CodeIcon className="w-4 h-4" />
      Integration guide
    </Button>
  );

  const scoringWarning = (message: React.ReactNode) => (
    <WarningBox
      action={needValues.length > 0 && configureTraceValues.button}
    >
      {message}
    </WarningBox>
  );

  const emptyState = (
    <>
      {traceScoring.enabled &&
        needValues.length > 0 &&
        scoringWarning(
          needValues.length === 1
            ? "1 evaluator has not been configured for traces"
            : `${needValues.length} evaluators have not been configured for traces`,
        )}
      <TracesEmptyState
        agentUuid={agentUuid}
        agentNature={agentNature}
        onCheckForTraces={async () => {
          // The first trace is also the first chance to have labels.
          refetchLabels();
          refetchConversationIds();
          return refetch();
        }}
      />
    </>
  );

  // A list that failed to load has nothing behind it, so the failure is all
  // that is shown: no search box, no filters, no count, no table, and none of
  // the scoring lines or averages, which would otherwise describe traces
  // nobody can see. Any open dialog goes with them for the same reason.
  // The setup steps are the one exception: the API key the reader just made
  // lives only on that screen and is shown once, so a failed check must not
  // take it away.
  if (error) {
    return (
      <div className="flex flex-col space-y-4 md:space-y-6">
        <ErrorNote className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          {/* The same arrow RunFailureBox uses, so a retry looks the same
              wherever something failed. It stays in its waiting state until
              the load answers, rather than letting the reader press twice. */}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium border border-red-300 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
              />
            </svg>
            {isRefreshing ? "Trying again" : "Try again"}
          </button>
        </ErrorNote>
        {showEmptyState && emptyState}
        {configureTraceValues.dialog}
      </div>
    );
  }

  const viewSwitch = hasLoaded && !showEmptyState && (
    <SegmentedFilter
      value={showConversations ? "conversations" : "traces"}
      onChange={(next) => setView({ conversations: next === "conversations" })}
      options={[
        { value: "traces", label: "Traces" },
        { value: "conversations", label: "Conversations" },
      ]}
      ariaLabel="Show traces or conversations"
      className="self-start"
    />
  );

  if (showConversations && viewSwitch) {
    return (
      <div className="flex flex-col space-y-4 md:space-y-6">
        {viewSwitch}
        <ConversationsView
          agentUuid={agentUuid}
          outputType={facets.outputType}
          labels={facets.labels}
          source={facets.source}
          feedback={facets.feedback}
          allLabels={allLabels}
          hasFeedback={anyFeedback}
          onFilterChange={(next) => setView(next)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-4 md:space-y-6">
      {viewSwitch}
      {/* The warnings sit close together as one group; the wrapper takes no
          room when none of them shows. */}
      <div className="space-y-2 empty:hidden">
        {/* Shown even over the setup steps: with storage full, the very thing
          those steps ask for cannot happen, and the reader would be left
          sending traces that are quietly turned away. */}
        {hasLoaded && storageFull && usage && (
          <WarningBox>
            New traces are no longer being stored because this workspace has
            reached its limit of {traceCount(usage.max_traces)}. Delete traces
            to make room. <ExtendLimitsLink />
          </WarningBox>
        )}

        {hasLoaded && chatLimitReached && (
          <WarningBox>
            Talking to this agent reached its limit of{" "}
            {chatReplyCap.toLocaleString()}{" "}
            {chatReplyCap === 1 ? "reply" : "replies"} today.{" "}
            <button
              type="button"
              onClick={onGoToSettings}
              className="font-bold cursor-pointer hover:opacity-80"
            >
              Click here
            </button>{" "}
            to increase the limit.
          </WarningBox>
        )}

        {/* Quiet while scoring works: the chip in the toolbar carries the state
          and its detail. Only a real problem takes a row of its own. */}
        {hasLoaded && !showEmptyState && hasWarning && (
          <div className="space-y-2">
            {scoringBlocked &&
              scoringWarning(
                everyEvaluatorNeedsValues(ineligible) ? (
                  EVERY_EVALUATOR_NEEDS_VALUES
                ) : (
                  <NothingCanScoreMessage
                    ineligible={ineligible}
                    onGoToEvaluators={onGoToEvaluators}
                  />
                ),
              )}
            {/* One warning for one problem: the line above already points
              to the Evaluators tab, where a tool call evaluator can be added. */}
            {missingToolCallEvaluator && !scoringBlocked && (
              <WarningBox>
                This agent has no tool call evaluator, so its tool calls are not
                checked. {addToolCallEvaluatorButton()}
              </WarningBox>
            )}
            {toolCallEvaluatorCannotScore && !scoringBlocked && (
              <WarningBox>
                No tool call evaluator on this agent can score traces, so its
                tool calls are not checked. Add one that can in the{" "}
                <EvaluatorsTabLink onGoToEvaluators={onGoToEvaluators} />.
              </WarningBox>
            )}
            {onlyToolCallEvaluators && (
              <WarningBox>
                Only tool call evaluators can score this agent&apos;s traces, so
                its {outputsWord} are not checked. Add an evaluator that checks{" "}
                {outputsWord} in the{" "}
                <EvaluatorsTabLink onGoToEvaluators={onGoToEvaluators} />.
              </WarningBox>
            )}
            {overLimit && (
              <WarningBox>
                {usage?.max_scored_traces != null
                  ? `Some traces were not scored because this workspace has reached its limit of scoring ${traceCount(usage.max_scored_traces)}.`
                  : "Some traces were not scored because this workspace has reached its limit for scoring traces."}{" "}
                <ExtendLimitsLink />
              </WarningBox>
            )}
          </div>
        )}
      </div>

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
          {/* One control for both the output kind and the labels, so the row
              stays the search box and the thing that narrows it. */}
          <TracesFilter
            value={facets}
            labels={allLabels}
            scoreEvaluators={scoreFilterEvaluators}
            conversationIds={conversationIds}
            hasFeedback={anyFeedback}
            onApply={(next) =>
              setView({
                ...next,
                conversationId: next.conversationId ?? null,
              })
            }
          />
          {/* The column headings sort the list too, but their arrow is easy
              to miss and they are gone altogether on a phone. */}
          <TracesSort
            value={{ evaluatorUuid: sortByEvaluator, order: sortOrder }}
            evaluators={scoreColumns}
            onChange={(next) =>
              setView({
                sortByEvaluator: next.evaluatorUuid,
                sortOrder: next.order,
              })
            }
          />
          {/* Not a filter, so it sits apart from the two that are, at the
              far end of the row. */}
          <div className="sm:ml-auto">{integrationGuideButton}</div>
        </div>
      )}

      {hasLoaded && !showEmptyState && scoreCards.length > 0 && (
        <EvaluatorScoreCards
          heading="Production quality"
          description={
            // The numbers are read from whatever the list is showing, so a
            // search or a filter makes "all the production traces" untrue.
            isNarrowed
              ? "Live average of the scores for each evaluator across the traces below"
              : "Live average of the scores for each evaluator across all the production traces"
          }
          cards={scoreCards}
          singleRow
          headingAside={
            // On whenever scoring is on, because that is what makes these
            // numbers live: they move on their own as traces arrive. Off once
            // a limit is reached, since a pulse over numbers that cannot move
            // reads as live when it is not.
            isScoringLive ? (
              <span
                aria-hidden
                className="inline-flex w-2 h-2 rounded-full bg-green-500 animate-pulse"
              />
            ) : null
          }
        />
      )}

      {!hasLoaded ? (
        <LoadingState />
      ) : showEmptyState ? (
        emptyState
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
                    onClick={() =>
                      setEveryTraceMatchingSince(new Date().toISOString())
                    }
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
                          toast.error(MIXED_SELECTION_ERROR);
                          return;
                        }
                        setConvertOpen(true);
                        return;
                      }
                      // The pages behind this one are unread, so the backend
                      // says what kinds they hold before anything is made.
                      const kind =
                        facets.outputType === "all"
                          ? await wholeListKindOf()
                          : facets.outputType;
                      if (!kind) return;
                      if (kind === "mixed") {
                        toast.error(MIXED_SELECTION_ERROR);
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
                          ? prepareLabelling([], {})
                          : setEvaluatorStepOpen(true)
                      }
                      className={SUBMIT_FOR_LABELLING_CLASS}
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
                  <button
                    type="button"
                    onClick={deletion.clearSelection}
                    className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                  >
                    Clear
                  </button>
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
            <div className="space-y-3 pt-2">
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
                trailing={
                  <div className="flex items-center gap-3">
                    <RefreshButton
                      loading={isRefreshing}
                      onClick={() => void handleRefresh()}
                    />
                    <TraceScoringChip traceScoring={traceScoring} />
                  </div>
                }
              />

              <TracesTable
                traces={items}
                checkboxProps={deletion.checkboxProps}
                allSelected={deletion.allSelected}
                hasSelectableItems={deletion.hasSelectableItems}
                onToggleSelectAll={deletion.toggleSelectAll}
                onOpen={itemPager.open}
                agentUuid={agentUuid}
                onDelete={deletion.openDeleteDialog}
                scoreColumns={scoreColumns}
                sortByEvaluator={sortByEvaluator}
                sortOrder={sortOrder}
                onSortByEvaluator={sortByEvaluatorScore}
              />
            </div>
          )}
        </div>
      )}

      <TraceIngestCodeDialog
        isOpen={integrationGuideOpen}
        onClose={() => setIntegrationGuideOpen(false)}
        agentUuid={agentUuid}
        agentNature={agentNature}
      />

      <TraceDetailDialog
        evaluatorDescriptions={evaluatorDescriptions}
        ineligibleEvaluators={ineligibleForOpenTrace}
        addToolCallEvaluator={
          missingToolCallEvaluator
            ? addToolCallEvaluatorButton(true)
            : undefined
        }
        scoringEvaluatorNames={
          traceScoring.enabled && !scoredTracesFull
            ? scoringNamesForOpenTrace
            : []
        }
        scoringEvaluatorUuids={
          traceScoring.enabled
            ? scoringForOpenTrace.map((item) => item.evaluator_uuid)
            : []
        }
        onScored={() => void refetch()}
        agentNature={agentNature}
        unconfiguredEvaluators={traceScoring.enabled ? needValues : undefined}
        onConfigureEvaluator={(uuid) =>
          configureTraceValues.configure(uuid, openTraceItem)
        }
        configuringEvaluatorUuid={configureTraceValues.loadingFor}
        onGoToEvaluators={
          // Pointing at the Evaluators tab helps only when no evaluator that
          // fits this trace is added yet.
          scoringNamesForOpenTrace.length > 0
            ? undefined
            : () => {
                closeTrace();
                onGoToEvaluators();
              }
        }
        keysPaused={toolCallPickerOpen || configureTraceValues.isOpen}
        isOpen={openTraceUuid != null}
        onClose={closeTrace}
        accessToken={accessToken}
        traceUuid={openTraceUuid}
        hasPrev={itemPager.hasPrev}
        hasNext={itemPager.hasNext}
        onPrev={itemPager.prev}
        onNext={itemPager.next}
        position={itemPager.position}
        isSelected={openTraceUuid != null && selected.has(openTraceUuid)}
        selectedCount={selectionCount}
        onToggleSelected={
          openTraceItem
            ? () => deletion.checkboxProps(openTraceItem).onToggle()
            : undefined
        }
      />

      <ConvertTracesToTestsDialog
        isOpen={convertOpen}
        onClose={() => setConvertOpen(false)}
        accessToken={accessToken}
        traceUuids={Array.from(selected)}
        selectAll={
          everyTraceMatching
            ? {
                ...selectAllFilters,
                // Only one kind of test is made per call, so an unfiltered
                // list is pinned to the kind the counts found.
                outputType:
                  facets.outputType === "all" && wholeListKind !== "mixed"
                    ? (wholeListKind ?? "all")
                    : facets.outputType,
              }
            : null
        }
        traceCount={selectionCount}
        testType={
          everyTraceMatching
            ? (facets.outputType === "all"
                ? wholeListKind
                : facets.outputType) === "tool_call"
              ? "tool_call"
              : isGeneral
                ? "general"
                : "response"
            : selectedTestType
        }
        agentUuid={agentUuid}
        agentNature={agentNature}
        nameFrom={
          selectedTraces.length === 1
            ? {
                comment: selectedTraces[0].feedback?.comment,
                userMessage: selectedTraces[0].input_preview,
              }
            : undefined
        }
        traceLabels={Object.fromEntries(
          selectedTraces.map((trace) => [trace.uuid, traceLabel(trace)]),
        )}
        fromTrace={selectedTraces[0]}
        onEvaluatorSetUp={afterEvaluatorSetUp}
        onConverted={(result, evaluatorsUsed = []) => {
          setConvertOpen(false);
          const created = result.created;
          // The created tests belong to this agent, so reload the Tests tab
          // and send the reader there rather than to the whole test library.
          onTestsCreated();
          setAddedTests(result.test_uuids);
          // Saved tests with no evaluator, or not added to the agent's Tests
          // tab. These stay until the reader closes them.
          for (const warning of result.warnings ?? []) {
            toast.warning(warning, { duration: Infinity });
          }
          afterAdded.current = () =>
            offerAgentDefaults(evaluatorsUsed, (isOne) =>
              created === 1
                ? `The test you just added uses ${isOne ? "an evaluator" : "evaluators"} that ${isOne ? "is" : "are"} not yet attached to this agent.`
                : `The tests you just added use ${isOne ? "an evaluator" : "evaluators"} that ${isOne ? "is" : "are"} not yet attached to this agent.`,
            );
        }}
      />

      {addedTests && (
        <AddedToTestsDialog
          testUuids={addedTests}
          orgUuid={orgUuid}
          agentUuid={agentUuid}
          noun="trace"
          onClose={() => {
            setAddedTests(null);
            afterAdded.current?.();
            afterAdded.current = null;
          }}
        />
      )}

      {/* Mounted only while open, so each visit starts from the agent's own
          evaluators rather than the last visit's ticks. */}
      {evaluatorStepOpen && (
        <TraceLabellingEvaluatorsDialog
          onClose={() => setEvaluatorStepOpen(false)}
          agentUuid={agentUuid}
          agentNature={agentNature}
          accessToken={accessToken}
          traces={replyTraces.map((trace) => ({
            uuid: trace.uuid,
            label: traceLabel(trace),
          }))}
          fromTrace={replyTraces[0]}
          onChosen={prepareLabelling}
          onEvaluatorSetUp={afterEvaluatorSetUp}
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
          // labelling flow. The ticks stay on, so the same traces can also be
          // added to tests without picking them all again.
          onAdded={() => {
            offerAgentDefaults(
              labellingEvaluators,
              (isOne) =>
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

      {/* Here, not beside its button: the first save can end the warning the
          button sits in while other evaluators are still waiting. */}
      {configureTraceValues.dialog}

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
