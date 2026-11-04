"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { SpinnerIcon } from "@/components/icons";
import { formatTraceDate } from "@/components/traces/TracesTable";
import type { AgentNature } from "@/components/traces/ingestSnippets";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAccessToken } from "@/hooks";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";
import { emptyValueCopy, traceBodyExample } from "@/lib/traceScoring";
import {
  fetchTraces,
  previewTraceVariables,
  type TraceSummary,
  type TraceVariablePreview,
} from "@/lib/tracesApi";

const PREVIEW_DELAY_MS = 300;
const RECENT_TRACES = 20;
const OPTION_INPUT_LENGTH = 40;

const HEADING = "text-sm md:text-base font-semibold text-foreground";
const ERROR = "text-sm text-red-600 dark:text-red-400";

function traceOptionLabel(trace: TraceSummary): string {
  const date = formatTraceDate(trace.created_at);
  const input = trace.input_preview?.trim();
  if (!input) return date;
  return input.length > OPTION_INPUT_LENGTH
    ? `${date} · ${input.slice(0, OPTION_INPUT_LENGTH).trimEnd()}...`
    : `${date} · ${input}`;
}

function Waiting({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <SpinnerIcon className="w-4 h-4 animate-spin" />
      {children}
    </p>
  );
}

/**
 * What the chosen values ask of a trace, and what they read from a real one.
 * Stays mounted while the reader moves between evaluators, so the traces are
 * fetched once per dialog.
 */
export function TraceVariablesPreview({
  agentUuid,
  agentNature,
  variables,
  choices,
}: {
  agentUuid: string;
  agentNature: AgentNature;
  variables: string[];
  /** Only the variables that have a value chosen. */
  choices: Record<string, string>;
}) {
  const accessToken = useAccessToken();
  // Null until the first answer. A failed fetch reads as no traces, so the
  // button to ask again is on screen beside the error.
  const [traces, setTraces] = useState<TraceSummary[] | null>(null);
  const [traceUuid, setTraceUuid] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [noTraceYet, setNoTraceYet] = useState(false);

  // Held with what it answered, so it is only ever drawn under those choices.
  const [answered, setAnswered] = useState<{
    key: string;
    values: TraceVariablePreview[];
    error: string | null;
  } | null>(null);
  const previewRequestId = useRef(0);

  const loadTraces = useCallback(
    async (token: string) => {
      try {
        const { items } = await fetchTraces(token, {
          limit: RECENT_TRACES,
          offset: 0,
          agentId: agentUuid,
        });
        setListError(null);
        setTraces(items);
        setTraceUuid(items[0]?.uuid ?? "");
        return items;
      } catch (err) {
        reportError("Error fetching traces:", err);
        setTraces((current) => current ?? []);
        setListError("Could not load the traces for this agent.");
        return null;
      }
    },
    [agentUuid],
  );

  useEffect(() => {
    if (accessToken) void loadTraces(accessToken);
  }, [accessToken, loadTraces]);

  const handleCheck = async () => {
    setChecking(true);
    setNoTraceYet(false);
    // This button only shows after a fetch, which needed a token.
    const items = await loadTraces(accessToken as string);
    setNoTraceYet(items?.length === 0);
    setChecking(false);
  };

  // Compared as text because the dialog builds a new object on every draw.
  const requestKey =
    traceUuid && Object.keys(choices).length > 0
      ? JSON.stringify([traceUuid, choices])
      : null;
  const current = answered?.key === requestKey ? answered : null;
  const previewing = requestKey !== null && current === null;

  useEffect(() => {
    const requestId = ++previewRequestId.current;
    if (!accessToken || !requestKey) return;
    const [traceId, traceVariables] = JSON.parse(requestKey);
    const timer = setTimeout(async () => {
      try {
        const { values } = await previewTraceVariables(
          accessToken,
          agentUuid,
          traceId,
          traceVariables,
        );
        if (requestId !== previewRequestId.current) return;
        setAnswered({ key: requestKey, values, error: null });
      } catch (err) {
        if (requestId !== previewRequestId.current) return;
        reportError("Error previewing trace values:", err);
        setAnswered({
          key: requestKey,
          values: [],
          error: parseBackendErrorMessage(err, "Could not read this trace."),
        });
      }
    }, PREVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [accessToken, agentUuid, requestKey]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h3 className={HEADING}>What your traces need to contain</h3>
        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto text-foreground">
          {JSON.stringify(traceBodyExample(agentNature, choices), null, 2)}
        </pre>
      </div>

      {traces === null ? (
        <Waiting>Loading</Waiting>
      ) : traces.length > 0 ? (
        <div className="space-y-3">
          <label htmlFor="trace-variables-test-trace" className={`block ${HEADING}`}>
            Test on a trace
          </label>
          <Select
            id="trace-variables-test-trace"
            value={traceUuid}
            onChange={(e) => setTraceUuid(e.target.value)}
            className="cursor-pointer"
          >
            {traces.map((trace) => (
              <option key={trace.uuid} value={trace.uuid}>
                {traceOptionLabel(trace)}
              </option>
            ))}
          </Select>
          {variables.map((name) => {
            const source = choices[name];
            const answer = current?.values.find((v) => v.variable === name);
            return (
              <div key={name} className="space-y-1">
                <p className="text-sm font-medium font-mono text-foreground break-all">
                  {`{{${name}}}`}
                </p>
                {!source ? (
                  <p className="text-sm text-muted-foreground">Not set</p>
                ) : previewing ? (
                  <Waiting>Loading</Waiting>
                ) : answer?.value === null ? (
                  <p className={ERROR}>
                    {emptyValueCopy(source, agentNature)}
                  </p>
                ) : (
                  answer && (
                    <p className="text-sm text-foreground whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                      {answer.value}
                    </p>
                  )
                )}
              </div>
            );
          })}
          {current?.error && (
            <p role="alert" className={ERROR}>
              {current.error}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Send a sample trace to test this on real data
          </p>
          <Button
            variant="secondary"
            size="sm"
            isLoading={checking}
            onClick={handleCheck}
          >
            Check for a trace
          </Button>
          {noTraceYet && (
            <p className="text-sm text-muted-foreground">No trace yet</p>
          )}
          {listError && (
            <p role="alert" className={ERROR}>
              {listError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
