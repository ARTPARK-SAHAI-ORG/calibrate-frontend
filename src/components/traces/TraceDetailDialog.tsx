"use client";

import { StoppedEarlyNote } from "@/components/chat/StoppedEarlyNote";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Link } from "@/lib/nav";
import {
  Button,
  DialogNavHeader,
  LoadingState,
  MetadataTable,
  type MetadataEntry,
} from "@/components/ui";
import { useDialogNavKeys, useResizableWidth } from "@/hooks";
import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import {
  ResizeHandle,
  TestDetailView,
  ToolCallCard,
  normalizeToolCall,
  type TestCaseHistory,
  type TestCaseOutput,
} from "@/components/test-results/shared";
import { Section } from "@/components/human-labelling/item-panes/shared";
import {
  fetchTrace,
  fetchTraces,
  fetchTraceScores,
  scoreTrace,
  MAX_TRACES_PAGE_SIZE,
  traceInputTurns,
  TraceDetail,
  TraceOutput,
  TraceConversation,
  TraceFeedback,
  TraceScoringIneligibleEvaluator,
  TraceScoringRun,
  TraceSource,
  TraceTurn,
} from "@/lib/tracesApi";
import { isTraceScoringInProgress } from "@/lib/traceScoring";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { reportError } from "@/lib/reportError";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import {
  formatTraceDate,
  TraceFeedbackThumb,
  TraceSourceLabel,
} from "./TracesTable";
import { TraceScorePanel } from "./TraceScorePanel";

type TraceDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  traceUuid: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: { index: number; total: number };
  /** What each evaluator is for, by evaluator id. The scores a trace carries
   *  name the evaluator but not what it judges, so the words come from the
   *  agent's own evaluator list. */
  evaluatorDescriptions?: Record<string, string>;
  /** The agent's evaluators that cannot score traces, and why. */
  ineligibleEvaluators?: TraceScoringIneligibleEvaluator[];
  /** The agent's evaluators that can score this trace now. With any, a trace
   *  skipped for lacking one can be scored again. */
  scoringEvaluatorNames?: string[];
  /** Told once a new scoring run was started, so the list can show it. */
  onScored?: () => void;
  /** Whether this trace is ticked in the list behind the dialog. */
  isSelected?: boolean;
  /** Tick or untick this trace without closing the dialog and going back to
   *  the list for its checkbox. */
  onToggleSelected?: () => void;
  /** How many traces are ticked in the list behind the dialog. Shown next to
   *  the button so the reader can see the pile growing without closing the
   *  window to look at the count. */
  selectedCount?: number;
  /** Show this conversation instead of a single trace. Its newest trace's
   *  stored history plus its reply is the whole conversation. */
  conversation?: TraceConversation | null;
};

/** Last user turn, else a generic heading when the history has no user text. */
export function humanTraceName(trace: Pick<TraceDetail, "input">): string {
  const turns = traceInputTurns(trace.input);
  for (let i = turns.length - 1; i >= 0; i--) {
    const turn = turns[i];
    if (
      turn.role === "user" &&
      typeof turn.content === "string" &&
      turn.content.trim()
    ) {
      return turn.content.trim();
    }
  }
  return "Trace";
}

function historyToolCalls(turn: TraceTurn): TestCaseHistory["tool_calls"] {
  const calls = turn.tool_calls;
  if (!Array.isArray(calls) || calls.length === 0) return undefined;
  return calls.map((raw, index) => {
    const { toolName, args } = normalizeToolCall(raw);
    const obj =
      raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
    return {
      id: typeof obj.id === "string" ? obj.id : `history-tool-${index}`,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    };
  });
}

/**
 * Which feedback goes under which agent reply in a conversation read back
 * whole. A chat trace is one user message and the agent's answer to it, so the
 * Nth trace (oldest first) is the last agent text reply after the Nth user
 * message. The newest trace's reply is the conversation's output, so its
 * feedback comes back as `last` rather than by position.
 */
export function feedbackByReply(
  history: TestCaseHistory[],
  feedbacks: (TraceFeedback | null | undefined)[],
): { byIndex: Map<number, TraceFeedback>; last: TraceFeedback | null } {
  const byIndex = new Map<number, TraceFeedback>();
  let users = 0;
  let reply = -1;
  history.forEach((message, index) => {
    if (message.role === "user") {
      const feedback = users > 0 && reply >= 0 ? feedbacks[users - 1] : null;
      if (feedback) byIndex.set(reply, feedback);
      users += 1;
      reply = -1;
    } else if (message.role === "assistant" && !message.tool_calls?.length) {
      reply = index;
    }
  });
  return { byIndex, last: (users > 0 && feedbacks[users - 1]) || null };
}

/** Map stored OpenAI-ish turns into the shared conversation renderer. */
export function turnsToHistory(input: TraceTurn[] | string): TestCaseHistory[] {
  const history: TestCaseHistory[] = [];
  for (const turn of traceInputTurns(input)) {
    const content = typeof turn.content === "string" ? turn.content : undefined;
    const createdAt =
      typeof turn.created_at === "string" ? turn.created_at : undefined;
    const ts = createdAt ? { created_at: createdAt } : {};
    // The instructions the agent was given are stored on the trace but never
    // drawn, so they are dropped here rather than left as an empty block.
    if (turn.role === "user" && content) {
      history.push({ role: "user", content, ...ts });
      continue;
    }
    if (turn.role === "assistant") {
      const tool_calls = historyToolCalls(turn);
      if (tool_calls || content) {
        history.push({
          role: "assistant",
          ...(content ? { content } : {}),
          ...(tool_calls ? { tool_calls } : {}),
          ...ts,
        });
      }
      continue;
    }
    if (turn.role === "tool" && content) {
      const toolCallId =
        typeof turn.tool_call_id === "string" ? turn.tool_call_id : undefined;
      history.push({
        role: "tool",
        content,
        ...(toolCallId ? { tool_call_id: toolCallId } : {}),
        ...ts,
      });
    }
  }
  return history;
}

export function toTestCaseOutput(
  output: TraceOutput,
): TestCaseOutput | undefined {
  const response = output.response?.trim() || undefined;
  const tool_calls = (output.tool_calls ?? [])
    .filter((call) => call.tool)
    .map((call) => ({
      tool: call.tool,
      arguments: call.arguments ?? {},
      // Kept so a trace whose agent ran the tool shows the result the same
      // way a test run does, instead of dropping it on the way through.
      ...(call.output !== undefined ? { output: call.output } : {}),
    }));
  if (!response && tool_calls.length === 0) return undefined;
  return {
    ...(response ? { response } : {}),
    ...(tool_calls.length > 0 ? { tool_calls } : {}),
  };
}

/**
 * A general agent answers one input at a time, so its trace reads as the input
 * and what the agent produced, the same two boxes an Agent Response labelling item
 * uses. Tool calls sit under the output, or stand in for it when the agent
 * called a tool instead of replying.
 */
/** The feedback a person left on the chat link, drawn under the reply it is
 *  about: the thumb, then their comment. */
function TraceFeedbackLine({ feedback }: { feedback: TraceFeedback }) {
  return (
    <div className="mt-2 flex items-start gap-2 text-sm text-foreground">
      <span className="mt-0.5 flex">
        <TraceFeedbackThumb feedback={feedback} />
      </span>
      {feedback.comment && (
        <span className="whitespace-pre-wrap break-words">
          {feedback.comment}
        </span>
      )}
    </div>
  );
}

function PlainTraceView({
  input,
  output,
  afterOutput,
}: {
  input: string;
  output: TraceOutput;
  afterOutput?: React.ReactNode;
}) {
  const response = output.response?.trim() ?? "";
  const toolCalls = (output.tool_calls ?? []).filter((call) => call.tool);

  return (
    <div className="p-5 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Input">
        <p className="text-sm whitespace-pre-wrap break-words">
          {input || "—"}
        </p>
      </Section>
      <Section title="Output">
        {response && (
          <p className="text-sm whitespace-pre-wrap break-words">{response}</p>
        )}
        {toolCalls.length > 0 && (
          <div className={`space-y-3 ${response ? "mt-3" : ""}`}>
            {toolCalls.map((call, index) => (
              <ToolCallCard
                key={`${call.tool}-${index}`}
                toolName={call.tool}
                args={call.arguments ?? {}}
                output={call.output}
              />
            ))}
          </div>
        )}
        {!response && toolCalls.length === 0 && (
          <p className="text-sm text-muted-foreground">—</p>
        )}
        {afterOutput}
      </Section>
    </div>
  );
}

function ConversationMetaPanel({
  conversation,
}: {
  conversation: TraceConversation;
}) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <MetaBlock label="Conversation" value={conversation.conversation_id} />
      <MetaBlock
        label="Started"
        value={formatTraceDate(conversation.first_turn_at)}
      />
      <MetaBlock
        label="Last activity"
        value={formatTraceDate(conversation.last_turn_at)}
      />
    </div>
  );
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="block text-sm font-semibold text-foreground">
        {label}
      </span>
      <span className="block text-xs text-foreground break-all">{value}</span>
    </div>
  );
}

/** IDs (when present), created time, labels, and ingest metadata — the left
 *  column. */
function TraceMetaPanel({
  messageId,
  conversationId,
  createdAt,
  labels,
  metadata,
  source,
}: {
  messageId: string | null;
  conversationId: string | null;
  createdAt: string;
  labels: string[] | null;
  metadata: MetadataEntry[] | null;
  source?: TraceSource;
}) {
  const tags = labels ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {messageId && <MetaBlock label="Name" value={messageId} />}
      {conversationId && (
        <MetaBlock label="Conversation" value={conversationId} />
      )}
      <MetaBlock label="Created" value={formatTraceDate(createdAt)} />
      {source && (
        <div>
          <span className="block text-sm font-semibold text-foreground mb-1">
            Source
          </span>
          <TraceSourceLabel source={source} tag />
        </div>
      )}
      {tags.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Labels</h3>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center px-2 py-1 rounded-md bg-muted text-foreground text-xs break-all"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      )}
      <MetadataTable entries={metadata} />
    </div>
  );
}

/**
 * Read-only detail view for one trace. Reuses the test-results conversation
 * renderer so history + the agent's final output look the same as a run;
 * ids, created time, and metadata sit in the left column and the latest
 * scores in the right one, like the evaluators column of a test run.
 */
export function TraceDetailDialog({
  isOpen,
  onClose,
  accessToken,
  traceUuid: traceUuidProp,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
  evaluatorDescriptions,
  isSelected = false,
  onToggleSelected,
  selectedCount = 0,
  conversation = null,
  ineligibleEvaluators,
  scoringEvaluatorNames = [],
  onScored,
}: TraceDetailDialogProps) {
  useHideFloatingButton(isOpen);
  // Scores belong to one turn, not the conversation, so none are loaded for it.
  const isConversation = conversation !== null;
  const traceUuid = conversation ? conversation.last_turn.uuid : traceUuidProp;

  // The trace is held with the id it was fetched for, so content is only ever
  // drawn under its own trace: asking for another one shows nothing until the
  // new one arrives, instead of the last one flashing under the new heading.
  const [loaded, setLoaded] = useState<{
    uuid: string;
    trace: TraceDetail;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Only the newest run is drawn, so only that one is kept.
  const [latestRun, setLatestRun] = useState<TraceScoringRun | null>(null);
  const [scoresError, setScoresError] = useState<string | null>(null);
  // A conversation's feedback, one entry per trace, oldest first.
  const [turnFeedback, setTurnFeedback] = useState<
    (TraceFeedback | null | undefined)[]
  >([]);
  const trace = isOpen && loaded?.uuid === traceUuid ? loaded.trace : null;
  const visibleRun = loaded?.uuid === traceUuid ? latestRun : null;
  const hasOpenScoreRun = isTraceScoringInProgress(visibleRun?.status);
  // Nothing has tried to score this trace, so it gets no scores column at all
  // rather than a wide empty one saying so.
  const showScores = !!trace && (visibleRun !== null || scoresError !== null);

  useEffect(() => {
    if (!isOpen || !traceUuid || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setLoaded(null);
      setLatestRun(null);
      setScoresError(null);
      setTurnFeedback([]);
      try {
        const [data, scores, turns] = await Promise.all([
          fetchTrace(accessToken, traceUuid),
          isConversation
            ? { runs: [] as TraceScoringRun[] }
            : fetchTraceScores(accessToken, traceUuid).catch((err) => {
                reportError("Error fetching trace scores:", err);
                if (!cancelled) {
                  setScoresError("Could not load scores for this trace.");
                }
                return { runs: [] as TraceScoringRun[] };
              }),
          // ponytail: one page of 200 turns; a longer conversation shows no
          // feedback on its oldest replies. Page through if that happens.
          conversation
            ? fetchTraces(accessToken, {
                agentId: conversation.agent_id,
                conversationId: conversation.conversation_id,
                limit: MAX_TRACES_PAGE_SIZE,
                offset: 0,
              }).catch((err) => {
                reportError("Error fetching conversation feedback:", err);
                return null;
              })
            : null,
        ]);
        if (!cancelled) {
          setLoaded({ uuid: traceUuid, trace: data });
          setLatestRun(scores.runs?.[0] ?? null);
          // The list comes newest first.
          setTurnFeedback(
            (turns?.items ?? []).map((t) => t.feedback).reverse(),
          );
        }
      } catch (err) {
        reportError("Error fetching trace:", err);
        if (!cancelled)
          setError(
            isConversation
              ? "Failed to load this conversation. Please try again."
              : "Failed to load this trace. Please try again.",
          );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // The conversation object changes with every list read; its id is what
    // decides what to fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, traceUuid, accessToken, isConversation]);

  useEffect(() => {
    if (!isOpen || !traceUuid || !accessToken || !hasOpenScoreRun) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const scores = await fetchTraceScores(accessToken, traceUuid);
        if (!cancelled) setLatestRun(scores.runs?.[0] ?? null);
      } catch (err) {
        reportError("Error polling trace scores:", err);
      }
    };
    const timer = window.setInterval(poll, POLLING_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [isOpen, traceUuid, accessToken, hasOpenScoreRun]);

  // The trace being sent, so moving to another trace leaves its button on.
  const [scoringUuid, setScoringUuid] = useState<string | null>(null);
  const shownTraceRef = useRef(traceUuid);
  shownTraceRef.current = traceUuid;
  const startScoring = async () => {
    if (!accessToken || !traceUuid || scoringUuid === traceUuid) return;
    const scored = traceUuid;
    setScoringUuid(scored);
    try {
      const run = await scoreTrace(accessToken, scored);
      onScored?.();
      // The reader may have moved to another trace while this was sent.
      if (shownTraceRef.current !== scored) return;
      // A pending run shows the spinner, and the poll above takes it from there.
      setLatestRun({
        run_uuid: run.run_uuid,
        status: run.status,
        created_at: new Date().toISOString(),
        error: null,
        results: [],
      });
    } catch (err) {
      toast.error(
        parseBackendErrorMessage(err, "Could not score this trace. Please try again."),
      );
    } finally {
      setScoringUuid((current) => (current === scored ? null : current));
    }
  };
  const scoreTraceButton = scoringEvaluatorNames.length > 0 ? (
    <button
      type="button"
      onClick={() => void startScoring()}
      disabled={scoringUuid === traceUuid}
      className="h-8 px-2.5 rounded-md text-sm font-medium border bg-amber-500/12 border-amber-500/45 text-amber-950 dark:text-amber-100 transition-colors hover:bg-amber-500/22 dark:hover:bg-amber-500/18 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
    >
      Score this trace
    </button>
  ) : undefined;
  const tryAgain =
    scoringEvaluatorNames.length > 0 ? () => void startScoring() : undefined;

  useDialogNavKeys({ isOpen, onClose, hasPrev, onPrev, hasNext, onNext });
  // Same width and limits as the evaluators column of the test results window.
  const scoresPanel = useResizableWidth(512, 320, 720, "grow-left");

  const history = useMemo(
    () => (trace ? turnsToHistory(trace.input) : []),
    [trace],
  );
  const output = useMemo(
    () => (trace ? toTestCaseOutput(trace.output) : undefined),
    [trace],
  );
  // In a conversation each reply carries the feedback of its own trace.
  const conversationFeedback = useMemo(
    () => (isConversation ? feedbackByReply(history, turnFeedback) : null),
    [isConversation, history, turnFeedback],
  );
  const lastFeedback = conversationFeedback
    ? conversationFeedback.last
    : trace?.feedback;
  const feedbackLine = (
    <>
      {trace?.output?.stopped_early && <StoppedEarlyNote />}
      {lastFeedback && <TraceFeedbackLine feedback={lastFeedback} />}
    </>
  );
  const afterTurn = conversationFeedback
    ? (index: number) => {
        const feedback = conversationFeedback.byIndex.get(index);
        return feedback ? <TraceFeedbackLine feedback={feedback} /> : null;
      }
    : undefined;
  // The heading shortens a long trace id with an ellipsis, so the whole id goes
  // in hover text only when it has been cut short.
  const headingText = conversation
    ? conversation.conversation_id
    : (traceUuid ?? "Trace");
  const { ref: headingRef, clipped: headingClipped } =
    useIsNameClipped(headingText);

  if (!isOpen) return null;

  const heading = (
    <h2
      ref={headingRef}
      className="text-base md:text-lg font-semibold text-foreground truncate min-w-0"
    >
      {headingText}
    </h2>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-[95vw] h-[92vh] flex flex-col shadow-2xl">
        <div className="relative flex items-start justify-between gap-3 p-5 md:p-6 border-b border-border">
          {headingClipped ? (
            <Tooltip content={headingText} className="min-w-0">
              {heading}
            </Tooltip>
          ) : (
            heading
          )}
          <DialogNavHeader
            noun={isConversation ? "conversation" : "trace"}
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            position={position}
          />
          {/* Kept together so both sit in the top right corner. Loose in the
              header they would be spread apart by the row's own spacing. */}
          <div className="flex items-center gap-3 flex-shrink-0">
            {conversation && (
              <Link
                href={`/agents/${conversation.agent_id}?tab=monitoring&conversation=${encodeURIComponent(conversation.conversation_id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="h-8 px-3 rounded-md text-sm font-medium flex items-center justify-center gap-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 dark:text-blue-300 transition-colors whitespace-nowrap"
              >
                View traces
              </Link>
            )}
            {/* Only while this trace is in the selection: the count answers
                "what did that press do", so it goes away with the trace it
                was counting. */}
            {onToggleSelected && isSelected && selectedCount > 0 && (
              <span className="inline-flex items-center h-8 px-2.5 rounded-md border border-border bg-muted/40 text-xs font-medium text-foreground whitespace-nowrap">
                {selectedCount} selected
              </span>
            )}
            {onToggleSelected && (
              // Both states are filled so neither reads as switched off, and
              // they are different colours so a glance says which one it is.
              <Button
                size="sm"
                variant={isSelected ? "danger" : "primary"}
                onClick={onToggleSelected}
                className="whitespace-nowrap"
              >
                {isSelected
                  ? "Remove trace from selection"
                  : "Add trace to selection"}
              </Button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex-shrink-0"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
          {trace && (
            <div className="order-last md:order-none md:w-80 border-t md:border-t-0 md:border-r border-border overflow-y-auto shrink-0">
              {conversation ? (
                <ConversationMetaPanel conversation={conversation} />
              ) : (
                <TraceMetaPanel
                  messageId={trace.message_id}
                  conversationId={trace.conversation_id}
                  createdAt={trace.created_at}
                  labels={trace.labels ?? null}
                  metadata={trace.metadata}
                  source={trace.source}
                />
              )}
            </div>
          )}
          <div className="flex-1 overflow-y-auto min-w-0">
            {isLoading && (
              <div className="p-5 md:p-6">
                <LoadingState />
              </div>
            )}
            {error && (
              <p className="p-5 md:p-6 text-sm text-red-600 dark:text-red-400">
                {error}
              </p>
            )}
            {trace &&
              (typeof trace.input === "string" ? (
                <PlainTraceView
                  input={trace.input}
                  output={trace.output}
                  afterOutput={feedbackLine}
                />
              ) : (
                <TestDetailView
                  history={history}
                  output={output}
                  passed={true}
                  showVerdict={false}
                  markOutput={!isConversation}
                  afterOutput={feedbackLine}
                  afterTurn={afterTurn}
                />
              ))}
            {/* Scores under the conversation on mobile only; on desktop
                they sit in the right column, the way a test run's do. */}
            {showScores && (
              <div className="md:hidden border-t border-border">
                <TraceScorePanel
                  run={visibleRun}
                  error={scoresError}
                  descriptions={evaluatorDescriptions}
                  ineligible={ineligibleEvaluators}
                  scoreTrace={scoreTraceButton}
                  scoringEvaluatorNames={scoringEvaluatorNames}
                  onTryAgain={tryAgain}
                />
              </div>
            )}
          </div>
          {showScores && (
            <>
              <ResizeHandle
                onMouseDown={scoresPanel.startDrag}
                label="Resize scores panel"
              />
              <div
                style={
                  {
                    "--verdict-w": `${scoresPanel.width}px`,
                  } as React.CSSProperties
                }
                className="hidden md:flex w-[var(--verdict-w)] flex-col overflow-hidden"
              >
                <div className="flex-1 overflow-y-auto">
                  <TraceScorePanel
                    run={visibleRun}
                    error={scoresError}
                    descriptions={evaluatorDescriptions}
                    ineligible={ineligibleEvaluators}
                    scoreTrace={scoreTraceButton}
                    scoringEvaluatorNames={scoringEvaluatorNames}
                    onTryAgain={tryAgain}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
