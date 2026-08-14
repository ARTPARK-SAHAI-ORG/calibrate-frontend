"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { LoadingState } from "@/components/ui";
import {
  TestDetailView,
  normalizeToolCall,
  type TestCaseHistory,
  type TestCaseOutput,
} from "@/components/test-results/shared";
import {
  fetchTrace,
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
};

/** Last user turn, else a generic heading when the history has no user text. */
export function humanTraceName(trace: Pick<TraceDetail, "input">): string {
  for (let i = trace.input.length - 1; i >= 0; i--) {
    const turn = trace.input[i];
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
export function turnsToHistory(turns: TraceTurn[]): TestCaseHistory[] {
  const history: TestCaseHistory[] = [];
  for (const turn of turns) {
    const content = typeof turn.content === "string" ? turn.content : undefined;
    const createdAt =
      typeof turn.created_at === "string" ? turn.created_at : undefined;
    const ts = createdAt ? { created_at: createdAt } : {};
    if (turn.role === "system" && content) {
      history.push({ role: "system", content, ...ts });
      continue;
    }
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

export function toTestCaseOutput(output: TraceOutput): TestCaseOutput | undefined {
  const response = output.response?.trim() || undefined;
  const tool_calls = (output.tool_calls ?? [])
    .filter((call) => call.tool)
    .map((call) => ({
      tool: call.tool,
      arguments: call.arguments ?? {},
    }));
  if (!response && tool_calls.length === 0) return undefined;
  return {
    ...(response ? { response } : {}),
    ...(tool_calls.length > 0 ? { tool_calls } : {}),
  };
}

function MetaBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-x-auto">
      <span className="block text-sm font-semibold text-foreground">{label}</span>
      <span className="block text-xs text-foreground whitespace-nowrap">
        {value}
      </span>
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
      {entries.map((entry, index) => (
        <MetaBlock
          key={`${entry.key}-${index}`}
          label={entry.key}
          value={entry.value}
        />
      ))}
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
}: TraceDetailDialogProps) {
  useHideFloatingButton(isOpen);

  const [trace, setTrace] = useState<TraceDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !traceUuid || !accessToken) return;
    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setTrace(null);
      try {
        const data = await fetchTrace(accessToken, traceUuid);
        if (!cancelled) setTrace(data);
      } catch (err) {
        reportError("Error fetching trace:", err);
        if (!cancelled) setError("Failed to load this trace. Please try again.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, traceUuid, accessToken]);

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
      <div className="bg-background rounded-xl w-full max-w-6xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 md:p-6 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground truncate min-w-0">
            {trace ? humanTraceName(trace) : "Trace"}
          </h2>
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
            {trace && (
              <TestDetailView
                history={history}
                output={output}
                passed={true}
                showVerdict={false}
              />
            )}
          </div>
          {trace && (
            <div className="md:w-[22rem] lg:w-[28rem] border-t md:border-t-0 md:border-l border-border overflow-y-auto shrink-0">
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
