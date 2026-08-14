"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { LoadingState } from "@/components/ui";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";
import {
  DEFAULT_LLM_NEXT_REPLY_SLUG,
  defaultOriginSlug,
} from "@/lib/defaultEvaluators";
import { fetchAllEvaluators, EvaluatorData } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import {
  convertTracesToTests,
  ConvertTestType,
  ConvertTracesToTestsResult,
} from "@/lib/tracesApi";

type ConvertTracesToTestsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  /** The selected trace uuids to convert. */
  traceUuids: string[];
  /** The test type derived from the selected traces. */
  testType: ConvertTestType;
  /** The agent whose traces these are — created tests link to it. */
  agentUuid: string;
  /** Called with the backend result after a successful conversion. */
  onConverted: (result: ConvertTracesToTestsResult) => void;
};

function toggle(set: Set<string>, uuid: string): Set<string> {
  const next = new Set(set);
  if (next.has(uuid)) next.delete(uuid);
  else next.add(uuid);
  return next;
}

/**
 * Convert selected traces into regression tests. `response` re-runs the agent
 * and judges the reply (requires ≥1 evaluator, defaulted to the workspace's
 * LLM-reply evaluator); `tool_call` asserts the recorded tool calls. Created
 * tests link to the agent the user is on, so they're runnable right away.
 */
export function ConvertTracesToTestsDialog({
  isOpen,
  onClose,
  accessToken,
  traceUuids,
  testType,
  agentUuid,
  onConverted,
}: ConvertTracesToTestsDialogProps) {
  useHideFloatingButton(isOpen);

  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [selectedEvaluators, setSelectedEvaluators] = useState<Set<string>>(
    new Set(),
  );
  const [acceptAnyArgs, setAcceptAnyArgs] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAcceptAnyArgs(false);
    setError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken || testType !== "response") return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const evs = await fetchAllEvaluators(accessToken);
        if (cancelled) return;
        const llm = evs.filter((e) => e.evaluator_type === "llm");
        setEvaluators(llm);
        // Seed the default LLM-reply evaluator, matching how the tests UI seeds.
        const preselect = llm.find(
          (e) => defaultOriginSlug(e) === DEFAULT_LLM_NEXT_REPLY_SLUG,
        );
        setSelectedEvaluators(preselect ? new Set([preselect.uuid]) : new Set());
      } catch (err) {
        reportError("Error loading convert options:", err);
        if (!cancelled) setError("Failed to load evaluators.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken, testType]);

  if (!isOpen) return null;

  const needsEvaluator = testType === "response";
  const canSubmit =
    !submitting &&
    (!needsEvaluator || !loading) &&
    traceUuids.length > 0 &&
    (!needsEvaluator || selectedEvaluators.size > 0);

  const submit = async () => {
    if (!accessToken || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await convertTracesToTests(accessToken, {
        traceIds: traceUuids,
        type: testType,
        evaluatorUuids:
          testType === "response" ? Array.from(selectedEvaluators) : undefined,
        agentUuids: [agentUuid],
        acceptAnyArguments: acceptAnyArgs,
      });
      onConverted(result);
    } catch (err) {
      reportError("Error converting traces to tests:", err);
      setError("Something went wrong while adding to tests. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const count = traceUuids.length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl">
        <div className="p-5 md:p-6 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Add {count} trace{count === 1 ? "" : "s"} to tests
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create regression tests you can run, benchmark, and send for
            labelling.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-5 md:p-6 space-y-5">
          {needsEvaluator && loading ? (
            <LoadingState />
          ) : (
            <>
              {testType === "response" ? (
                <div className="space-y-2">
                  <div className="text-sm font-semibold text-foreground">
                    Evaluators
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Pick at least one. Each created test judges the reply with
                    these.
                  </p>
                  {evaluators.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic">
                      No LLM evaluators available.
                    </p>
                  ) : (
                    <div className="border border-border rounded-lg max-h-44 overflow-y-auto divide-y divide-border">
                      {evaluators.map((e) => (
                        <label
                          key={e.uuid}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-muted/30"
                        >
                          <SelectCheckbox
                            checked={selectedEvaluators.has(e.uuid)}
                            onToggle={() =>
                              setSelectedEvaluators((prev) =>
                                toggle(prev, e.uuid),
                              )
                            }
                            label={`Select evaluator ${e.name}`}
                          />
                          <span className="text-sm text-foreground truncate">
                            {e.name}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <label className="flex items-center gap-2 cursor-pointer">
                  <SelectCheckbox
                    checked={acceptAnyArgs}
                    onToggle={() => setAcceptAnyArgs((v) => !v)}
                    label="Match tool name only"
                  />
                  <span className="text-sm text-foreground">
                    Match tool name only (ignore arguments)
                  </span>
                </label>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Adding..." : "Add to tests"}
          </button>
        </div>
      </div>
    </div>
  );
}
