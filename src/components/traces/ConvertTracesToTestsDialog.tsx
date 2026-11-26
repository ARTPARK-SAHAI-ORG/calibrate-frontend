"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { CloseIcon } from "@/components/icons";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import { DialogStepper, LoadingState } from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";
import { reportError } from "@/lib/reportError";
import { agentTaskType } from "@/lib/traceScoring";
import {
  convertTracesToTests,
  convertTracesErrorMessage,
  ConvertTestType,
  ConvertTracesToTestsResult,
  defaultTestName,
  type TraceSelectAll,
} from "@/lib/tracesApi";

type ConvertTracesToTestsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string | null;
  /** The selected trace uuids to convert. */
  traceUuids: string[];
  /** Set when the reader asked for every trace the list matches: the backend
   *  re-reads them from these filters instead of the ticked ids. */
  selectAll?: TraceSelectAll | null;
  /** How many traces this will convert. The ticked count, or the whole list
   *  when every matching trace was asked for. */
  traceCount?: number;
  /** The test type derived from the selected traces. */
  testType: ConvertTestType;
  /** The agent whose traces these are, for the evaluators offered here. */
  agentUuid: string;
  /** Decides which kind of evaluator can judge what this agent produced. */
  agentNature?: "conversation" | "general";
  /** What one trace's test name starts from. Given when a single trace is
   *  converted, which adds a step to name the test. */
  nameFrom?: { comment?: string | null; userMessage?: string | null };
  /** Called with the backend result after a successful conversion. */
  /** The second argument is the evaluators the created tests were given, so
   *  the caller can offer to attach any the agent does not have yet. */
  onConverted: (
    result: ConvertTracesToTestsResult,
    evaluatorsUsed: { uuid: string; name: string }[],
  ) => void;
};

const SECONDARY_BUTTON =
  "h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";
const PRIMARY_BUTTON =
  "h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed";

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
  selectAll = null,
  traceCount,
  testType,
  agentUuid,
  agentNature = "conversation",
  nameFrom,
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
  // Only one trace's test can be named; a batch is named by the backend.
  const naming = !!nameFrom && !selectAll && traceUuids.length === 1;
  const suggested = defaultTestName(nameFrom?.comment, nameFrom?.userMessage);
  // Null until the reader types, so the suggestion shows until then.
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = (typedName ?? suggested.name).trim();
  // Naming, then picking evaluators. A tool-call test has no evaluators, so
  // naming it is the whole window.
  const stepped = naming && needsEvaluator;
  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  // The evaluator made from inside this dialog, so its prompt opens on the
  // right as well as its box being ticked.
  const [createdUuid, setCreatedUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPickedEvaluators(null);
    setTypedName(null);
    setStep(1);
    setError(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const canSubmit =
    !submitting &&
    (!needsEvaluator || !loading) &&
    (selectAll !== null || traceUuids.length > 0) &&
    (!naming || name.length > 0) &&
    (!needsEvaluator || selectedEvaluators.size > 0);

  const submit = async () => {
    if (!accessToken || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await convertTracesToTests(accessToken, {
        traceIds: traceUuids,
        selectAll,
        type: testType,
        evaluatorUuids: needsEvaluator
          ? Array.from(selectedEvaluators)
          : undefined,
        // The recorded calls become the expected output, arguments and all,
        // and the test can be edited afterwards.
        acceptAnyArguments: false,
        name: naming ? name : undefined,
      });
      onConverted(
        result,
        needsEvaluator
          ? evaluators
              .filter((e) => selectedEvaluators.has(e.uuid))
              .map((e) => ({ uuid: e.uuid, name: e.name }))
          : [],
      );
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

  const count = traceCount ?? traceUuids.length;
  const showPicker = needsEvaluator && !(stepped && step === 1);
  // Says what is needed, why nothing is on offer, and what to do about it.
  const emptyEvaluatorMessage =
    agentNature === "general"
      ? "Each test needs at least one evaluator to score the agent's output. Your workspace has none that score a single output, so create one to continue."
      : "Each test needs at least one evaluator to score the agent's reply. Your workspace has none that score a reply in a conversation, so create one to continue.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className={`bg-background rounded-xl w-full flex flex-col shadow-2xl ${
          showPicker
            ? // The evaluator list and the prompt beside it need the room.
              "max-w-6xl max-h-[90vh] md:h-[85vh]"
            : naming
              ? "max-w-2xl max-h-[85vh]"
              : // A sentence and two buttons, so the same size as any other
                // confirmation.
                "max-w-md max-h-[85vh]"
        }`}
      >
        <div className="px-5 md:px-6 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Add {count} trace{count === 1 ? "" : "s"} to your tests
            </h2>
            {/* The steps' footer has no Cancel, so closing lives here. */}
            {stepped && (
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                aria-label="Close"
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <CloseIcon className="w-5 h-5" />
              </button>
            )}
          </div>
          {stepped && (
            <DialogStepper
              steps={[
                { n: 1, label: "Test name" },
                { n: 2, label: "Evaluators" },
              ]}
              current={step}
              isDone={(n) => (n === 1 ? name.length > 0 : false)}
              // Leaving step 2 mid-save would hide an error it shows.
              onSelect={(n) => !submitting && setStep(n as 1 | 2)}
            />
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-5 md:p-6 flex flex-col gap-2">
          {naming && !showPicker && (
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="convert-test-name"
                className="text-sm font-medium text-foreground"
              >
                Test name
              </label>
              <input
                id="convert-test-name"
                autoFocus
                value={typedName ?? suggested.name}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full h-9 md:h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
              {typedName === null && suggested.from && (
                <p className="text-xs md:text-sm text-muted-foreground">
                  {suggested.from === "comment"
                    ? "Filled in from the comment left with the rating"
                    : "Filled in from the user's message"}
                </p>
              )}
            </div>
          )}
          {needsEvaluator && !showPicker ? null : needsEvaluator && loading ? (
            <LoadingState />
          ) : (
            <>
              {needsEvaluator ? (
                <div className="flex-1 min-h-0 flex flex-col gap-2">
                  {evaluators.length > 0 && (
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-foreground">
                        Pick at least one evaluator for evaluating the
                        agent&apos;s performance
                      </p>
                      {/* The same offer the empty picker makes, kept in reach
                          once there is a list to read. */}
                      <button
                        type="button"
                        onClick={() => setCreateFlowOpen(true)}
                        className="h-8 px-3 rounded-md text-xs md:text-sm font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18"
                      >
                        Create evaluator
                      </button>
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
                      previewUuid={createdUuid}
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
          {stepped ? (
            step === 2 && (
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={submitting}
                className={SECONDARY_BUTTON}
              >
                Back
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className={SECONDARY_BUTTON}
            >
              Cancel
            </button>
          )}
          {stepped && step === 1 ? (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={name.length === 0}
              className={PRIMARY_BUTTON}
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={!canSubmit}
              className={PRIMARY_BUTTON}
            >
              {submitting ? "Adding..." : "Add to tests"}
            </button>
          )}
        </div>
      </div>

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        onCreated={(created) => {
          addEvaluator(created);
          setCreatedUuid(created.uuid);
          // Ticking already started, so the new one has to join that set
          // rather than the untouched default.
          setPickedEvaluators((prev) =>
            prev ? new Set(prev).add(created.uuid) : prev,
          );
          setCreateFlowOpen(false);
        }}
        // Single type only, so the flow skips the "what is this for?" step.
        useCaseTypes={[agentTaskType(agentNature)]}
      />
    </div>
  );
}
