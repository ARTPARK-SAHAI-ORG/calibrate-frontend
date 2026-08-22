"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import { LoadingState } from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";
import { reportError } from "@/lib/reportError";
import {
  convertTracesToTests,
  convertTracesErrorMessage,
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
  /** The agent whose traces these are, for the evaluators offered here. */
  agentUuid: string;
  /** Decides which kind of evaluator can judge what this agent produced. */
  agentNature?: "conversation" | "general";
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
 * Convert selected traces into regression tests. `response` and `general`
 * re-run the agent and judge what it produced (each requires at least one
 * evaluator, defaulted to the workspace's built-in one for that kind of
 * agent); `tool_call` asserts the recorded tool calls. Created tests are
 * linked by the backend to the agent that produced each trace, so they are
 * runnable right away.
 */
export function ConvertTracesToTestsDialog({
  isOpen,
  onClose,
  accessToken,
  traceUuids,
  testType,
  agentUuid,
  agentNature = "conversation",
  onConverted,
}: ConvertTracesToTestsDialogProps) {
  useHideFloatingButton(isOpen);

  // A tool-call test asserts the recorded calls and takes no evaluators. Every
  // other kind judges what the agent produced and needs at least one.
  const needsEvaluator = testType !== "tool_call";

  const {
    evaluators,
    preselectedUuids,
    isLoading: loading,
    error: loadError,
    addEvaluator,
  } = useAgentLlmEvaluators({
    agentUuid,
    accessToken,
    enabled: isOpen && needsEvaluator,
    agentNature,
  });
  // Null until the reader ticks something: until then the agent's own
  // evaluators are what is selected, and reopening starts from them again.
  const [pickedEvaluators, setPickedEvaluators] = useState<Set<string> | null>(
    null,
  );
  const selectedEvaluators = pickedEvaluators ?? preselectedUuids;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setPickedEvaluators(null);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

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
        evaluatorUuids: needsEvaluator
          ? Array.from(selectedEvaluators)
          : undefined,
        // The recorded calls become the expected output, arguments and all,
        // and the test can be edited afterwards.
        acceptAnyArguments: false,
      });
      onConverted(result);
    } catch (err) {
      reportError("Error converting traces to tests:", err);
      // Nothing is created when a conversion fails, so the reader can fix what
      // the backend names and press the button again.
      setError(
        convertTracesErrorMessage(err) ??
          "Something went wrong while adding to tests. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const count = traceUuids.length;
  // Says what is needed, why nothing is on offer, and what to do about it.
  const emptyEvaluatorMessage =
    agentNature === "general"
      ? "Each test needs at least one evaluator to score the agent's output. Your workspace has none that score a single output, so create one to continue."
      : "Each test needs at least one evaluator to score the agent's reply. Your workspace has none that score a reply in a conversation, so create one to continue.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={`bg-background rounded-xl w-full max-w-6xl flex flex-col shadow-2xl ${
          needsEvaluator ? "max-h-[90vh] md:h-[85vh]" : "max-h-[85vh]"
        }`}
      >
        <div className="p-5 md:p-6 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Add {count} trace{count === 1 ? "" : "s"} to your tests
          </h2>
          {/* Tool-call traces have nothing to choose, so the whole dialog is
              the one sentence below and a confirmation. */}
          {needsEvaluator && (
            <p className="text-sm text-muted-foreground mt-1">
              Pick at least one evaluator for evaluating the agent&apos;s
              performance
            </p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-5 md:p-6 flex flex-col gap-2">
          {needsEvaluator && loading ? (
            <LoadingState />
          ) : (
            <>
              {needsEvaluator ? (
                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  {evaluators.length > 0 && (
                    <div className="text-sm font-semibold text-foreground">
                      Evaluators
                    </div>
                  )}
                  <div className="flex-1 min-h-0">
                    <EvaluatorPicker
                      evaluators={evaluators}
                      selectedIds={selectedEvaluators}
                      onToggle={(uuid) =>
                        setPickedEvaluators((prev) =>
                          toggle(prev ?? preselectedUuids, uuid),
                        )
                      }
                      emptyMessage={emptyEvaluatorMessage}
                      emptyAction={
                        <button
                          type="button"
                          onClick={() => setCreateFlowOpen(true)}
                          className="h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18"
                        >
                          Create evaluator
                        </button>
                      }
                      fillHeight
                    />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-foreground">
                  The resulting tests will consider the tool calls recorded in{" "}
                  {count === 1 ? "this trace" : "these traces"} as the expected
                  output. This can be changed later for each test.
                </p>
              )}

              {(error ?? loadError) && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error ?? loadError}
                </p>
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

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        onCreated={(created) => {
          addEvaluator(created);
          // Ticking already started, so the new one has to join that set
          // rather than the untouched default.
          setPickedEvaluators((prev) =>
            prev ? new Set(prev).add(created.uuid) : prev,
          );
          setCreateFlowOpen(false);
        }}
        // Single type only, so the flow skips the "what is this for?" step.
        useCaseTypes={agentNature === "general" ? ["llm-general"] : ["llm"]}
      />
    </div>
  );
}
