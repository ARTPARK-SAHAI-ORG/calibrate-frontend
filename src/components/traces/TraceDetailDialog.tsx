"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { DialogNavHeader, LoadingState } from "@/components/ui";
import { useDialogNavKeys } from "@/hooks";
import {
  TestDetailView,
  ToolCallCard,
  normalizeToolCall,
  type TestCaseHistory,
  type TestCaseOutput,
} from "@/components/test-results/shared";
import { Section } from "@/components/human-labelling/item-panes/shared";
import {
  fetchTrace,
  traceInputTurns,
  TraceDetail,
  TraceMetadataEntry,
  TraceOutput,
  TraceTurn,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";
import { formatTraceDate } from "./TracesTable";

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
 * and what the agent produced, the same two boxes an LLM output labelling item
 * uses. Tool calls sit under the output, or stand in for it when the agent
 * called a tool instead of replying.
 */
function PlainTraceView({
  input,
  output,
}: {
  input: string;
  output: TraceOutput;
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
      </Section>
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

/** IDs (when present), created time, and ingest metadata — the right column. */
function TraceMetaPanel({
  messageId,
  conversationId,
  createdAt,
  metadata,
}: {
  messageId: string | null;
  conversationId: string | null;
  createdAt: string;
  metadata: TraceMetadataEntry[] | null;
}) {
  const entries = metadata ?? [];

  return (
    <div className="p-4 md:p-6 space-y-4">
      {messageId && <MetaBlock label="Name" value={messageId} />}
      {conversationId && (
        <MetaBlock label="Conversation" value={conversationId} />
      )}
      <MetaBlock label="Created" value={formatTraceDate(createdAt)} />
      {entries.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">Metadata</h3>
          <div className="border border-border rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-border bg-muted/30 font-medium text-muted-foreground">
              <div>Field</div>
              <div>Value</div>
            </div>
            {entries.map((entry, index) => (
              <div
                key={`${entry.key}-${index}`}
                className="grid grid-cols-2 gap-3 px-3 py-2 border-b border-border last:border-b-0"
              >
                <div className="font-medium text-foreground break-all">
                  {entry.key}
                </div>
                <div className="text-foreground break-all">{entry.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Read-only detail view for one trace. Reuses the test-results conversation
 * renderer so history + the agent's final output look the same as a run;
 * ids, created time, and metadata sit in the right-hand column.
 */
export function TraceDetailDialog({
  isOpen,
  onClose,
  accessToken,
  traceUuid,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
}: TraceDetailDialogProps) {
  useHideFloatingButton(isOpen);

  // The trace is held with the id it was fetched for, so content is only ever
  // drawn under its own trace: asking for another one shows nothing until the
  // new one arrives, instead of the last one flashing under the new heading.
  const [loaded, setLoaded] = useState<{
    uuid: string;
    trace: TraceDetail;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trace = isOpen && loaded?.uuid === traceUuid ? loaded.trace : null;

  useEffect(() => {
    if (!isOpen || !traceUuid || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setLoaded(null);
      try {
        const data = await fetchTrace(accessToken, traceUuid);
        if (!cancelled) setLoaded({ uuid: traceUuid, trace: data });
      } catch (err) {
        reportError("Error fetching trace:", err);
        if (!cancelled)
          setError("Failed to load this trace. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, traceUuid, accessToken]);

  useDialogNavKeys({ isOpen, onClose, hasPrev, onPrev, hasNext, onNext });

  const history = useMemo(
    () => (trace ? turnsToHistory(trace.input) : []),
    [trace],
  );
  const output = useMemo(
    () => (trace ? toTestCaseOutput(trace.output) : undefined),
    [trace],
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-[95vw] h-[92vh] flex flex-col shadow-2xl">
        <div className="relative flex items-start justify-between gap-3 p-5 md:p-6 border-b border-border">
          <h2
            className="text-base md:text-lg font-semibold text-foreground truncate min-w-0"
            title={traceUuid ?? undefined}
          >
            {traceUuid ?? "Trace"}
          </h2>
          <DialogNavHeader
            noun="trace"
            onPrev={onPrev}
            onNext={onNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            position={position}
          />
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

        <div className="flex-1 overflow-hidden flex flex-col md:flex-row min-h-0">
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
                <PlainTraceView input={trace.input} output={trace.output} />
              ) : (
                <TestDetailView
                  history={history}
                  output={output}
                  passed={true}
                  showVerdict={false}
                />
              ))}
          </div>
          {trace && (
            <div className="md:w-96 border-t md:border-t-0 md:border-l border-border overflow-y-auto shrink-0">
              <TraceMetaPanel
                messageId={trace.message_id}
                conversationId={trace.conversation_id}
                createdAt={trace.created_at}
                metadata={trace.metadata}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
