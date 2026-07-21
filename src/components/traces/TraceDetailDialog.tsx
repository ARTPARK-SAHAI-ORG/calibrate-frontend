"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { LoadingState } from "@/components/ui";
import { fetchTrace, TraceDetail, TraceTurn } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";
import { formatTraceDate } from "./TracesTable";

type TraceDetailDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  traceUuid: string | null;
};

/** OpenAI-format tool calls carried on an assistant history turn. */
type HistoryToolCall = {
  id?: string;
  function?: { name?: string; arguments?: string };
};

function historyToolCalls(turn: TraceTurn): HistoryToolCall[] {
  const calls = (turn as { tool_calls?: unknown }).tool_calls;
  return Array.isArray(calls) ? (calls as HistoryToolCall[]) : [];
}

/** Render a parameter value: strings verbatim, everything else as JSON. */
function formatArgValue(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * OpenAI history tool calls carry `arguments` as a JSON string; normalize it
 * to the same `{key: value}` map the flat output tool calls already use. A
 * non-object payload (or unparseable string) is shown as a single `value` row
 * rather than dropped.
 */
function parseHistoryArgs(raw?: string): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return { value: parsed };
  } catch {
    return { value: raw };
  }
}

/**
 * One tool call rendered as a table: the tool name, then a parameters section
 * with a row per argument. Shared by the agent output (flat `{tool, arguments}`
 * shape) and the OpenAI-format history turns.
 */
function ToolCallTable({
  name,
  args,
}: {
  name: string;
  args: Record<string, unknown> | null;
}) {
  const entries = args ? Object.entries(args) : [];
  return (
    <div className="border border-border rounded-md overflow-hidden bg-background">
      <table className="w-full text-xs">
        <tbody>
          <tr className="border-b border-border">
            <td className="px-2.5 py-1.5 font-medium text-muted-foreground align-top w-32">
              tool call
            </td>
            <td className="px-2.5 py-1.5 font-mono text-foreground break-all">
              {name}
            </td>
          </tr>
          <tr className="border-b border-border last:border-b-0 bg-muted/40">
            <td
              colSpan={2}
              className="px-2.5 py-1 font-medium text-muted-foreground uppercase tracking-wide text-[10px]"
            >
              parameters
            </td>
          </tr>
          {entries.length === 0 ? (
            <tr>
              <td
                colSpan={2}
                className="px-2.5 py-1.5 text-muted-foreground italic"
              >
                None
              </td>
            </tr>
          ) : (
            entries.map(([key, value]) => (
              <tr key={key} className="border-b border-border last:border-b-0">
                <td className="px-2.5 py-1.5 font-mono text-muted-foreground align-top w-32 break-all">
                  {key}
                </td>
                <td className="px-2.5 py-1.5 font-mono text-foreground break-all whitespace-pre-wrap">
                  {formatArgValue(value)}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function TurnBubble({ turn }: { turn: TraceTurn }) {
  const toolCalls = historyToolCalls(turn);
  return (
    <div className="border border-border rounded-lg p-3 bg-background">
      <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
        {turn.role}
      </div>
      {typeof turn.content === "string" && turn.content && (
        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
          {turn.content}
        </p>
      )}
      {toolCalls.length > 0 && (
        <div className="mt-2 space-y-2">
          {toolCalls.map((call, index) => (
            <ToolCallTable
              key={call.id ?? index}
              name={call.function?.name ?? "tool call"}
              args={parseHistoryArgs(call.function?.arguments)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Read-only detail view for one trace: the stored conversation history, the
 * agent output for the turn (highlighted — it's what curation judges), and
 * the metadata entries. Fetches its own data so the list page never needs to
 * hold full trace bodies.
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

  if (!isOpen) return null;

  const outputToolCalls = trace?.output?.tool_calls ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-3xl max-h-[85vh] flex flex-col shadow-2xl">
        <div className="flex items-start justify-between gap-3 p-5 md:p-6 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Trace
            </h2>
            {trace && (
              <p className="font-mono text-xs text-muted-foreground truncate mt-1">
                {trace.message_id} · {trace.conversation_id}
              </p>
            )}
          </div>
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

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {isLoading && <LoadingState />}
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          {trace && (
            <>
              <section>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Conversation history
                </h3>
                <div className="space-y-2">
                  {trace.input.map((turn, index) => (
                    <TurnBubble key={index} turn={turn} />
                  ))}
                </div>
              </section>

              <section>
                <h3 className="text-sm font-semibold text-foreground mb-2">
                  Agent output
                </h3>
                <div className="border border-foreground/30 rounded-lg p-3 bg-muted/30">
                  {trace.output?.response ? (
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                      {trace.output.response}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      No text response
                    </p>
                  )}
                  {outputToolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {outputToolCalls.map((call, index) => (
                        <ToolCallTable
                          key={index}
                          name={call.tool}
                          args={call.arguments ?? null}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </section>

              {trace.metadata && trace.metadata.length > 0 && (
                <section>
                  <h3 className="text-sm font-semibold text-foreground mb-2">
                    Metadata
                  </h3>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <tbody>
                        {trace.metadata.map((entry, index) => (
                          <tr
                            key={`${entry.key}-${index}`}
                            className="border-b border-border last:border-b-0"
                          >
                            <td className="px-3 py-2 font-mono text-xs text-muted-foreground align-top w-1/3 break-all">
                              {entry.key}
                            </td>
                            <td className="px-3 py-2 text-[13px] text-foreground break-words">
                              {entry.value}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}

              <p className="text-xs text-muted-foreground">
                Ingested {formatTraceDate(trace.created_at)}
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
