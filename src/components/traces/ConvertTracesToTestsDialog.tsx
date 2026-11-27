"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { CloseIcon } from "@/components/icons";
import {
  Button,
  DialogStepper,
  ErrorNote,
  LoadingState,
} from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";
import { reportError } from "@/lib/reportError";
import {
  convertMissingValues,
  convertTracesToTests,
  convertTracesErrorMessage,
  ConvertTestType,
  ConvertTracesToTestsResult,
  defaultTestName,
  type TraceSelectAll,
  type TraceSummary,
} from "@/lib/tracesApi";
import {
  AgentEvaluatorStep,
  hasVariables,
  readTraceValues,
  READ_VALUES_ERROR,
  type StepTrace,
} from "./AgentEvaluatorStep";
import { MissingValuesDialog, type MissingValues } from "./MissingValuesDialog";

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
  /** How each trace is named to the reader, by its id. */
  traceLabels?: Record<string, string>;
  /** The trace setting up an evaluator's variables is tried on first. */
  fromTrace?: TraceSummary;
  /** Called with the backend result after a successful conversion. */
  /** The second argument is the evaluators the created tests were given, so
   *  the caller can offer to attach any the agent does not have yet. */
  onConverted: (
    result: ConvertTracesToTestsResult,
    evaluatorsUsed: { uuid: string; name: string }[],
  ) => void;
  /** Called once an evaluator's variables are set up from here. */
  onEvaluatorSetUp?: () => void;
};

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
  traceLabels,
  fromTrace,
  onConverted,
  onEvaluatorSetUp,
}: ConvertTracesToTestsDialogProps) {
  useHideFloatingButton(isOpen);

  // A tool-call test asserts the recorded calls and takes no evaluators. Every
  // other kind judges what the agent produced and needs at least one.
  const needsEvaluator = testType !== "tool_call";

  const list = useAgentLlmEvaluators({
    agentUuid,
    accessToken,
    enabled: isOpen && needsEvaluator,
    agentNature,
  });
  const {
    evaluators,
    selectedUuids: selectedEvaluators,
    isLoading: loading,
    error: loadError,
  } = list;
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
  // Traces with nothing for a variable, asked about before adding without them.
  const [missing, setMissing] = useState<MissingValues | null>(null);
  const [skipping, setSkipping] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setTypedName(null);
    setMissing(null);
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

  const chosen = needsEvaluator
    ? evaluators.filter((e) => selectedEvaluators.has(e.uuid))
    : [];
  const withVariables = chosen.filter(hasVariables);
  // Blank for a trace not on the page; the values read then name it.
  const stepTraces = (uuids: string[]): StepTrace[] =>
    uuids.map((uuid) => ({ uuid, label: traceLabels?.[uuid] ?? "" }));

  const convert = (skipMissingValues: boolean) =>
    convertTracesToTests(accessToken as string, {
      traceIds: traceUuids,
      selectAll,
      type: testType,
      evaluatorUuids: needsEvaluator ? chosen.map((e) => e.uuid) : undefined,
      // The recorded calls become the expected output, arguments and all,
      // and the test can be edited afterwards.
      acceptAnyArguments: false,
      name: naming ? name : undefined,
      skipMissingValues,
    }).then((result) =>
      onConverted(
        result,
        chosen.map((e) => ({ uuid: e.uuid, name: e.name })),
      ),
    );

  const showFailure = (err: unknown) => {
    reportError("Error converting traces to tests:", err);
    // Nothing is created when a conversion fails, so the reader can fix what
    // the backend names and press the button again.
    setError(
      convertTracesErrorMessage(err) ??
        "Something went wrong while adding to tests. Please try again.",
    );
  };

  // The traces lacking a value, null when none does, or undefined when the
  // values could not be read, which has already been said in the window.
  const readGaps = async (token: string, uuids: string[]) => {
    try {
      return (
        await readTraceValues(
          token,
          agentUuid,
          withVariables,
          stepTraces(uuids),
        )
      ).missing;
    } catch (err) {
      reportError("Error reading trace values:", err);
      setError(READ_VALUES_ERROR);
      return undefined;
    }
  };

  const submit = async () => {
    if (!accessToken || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      // Picked traces are checked first. Every trace the list matches has no
      // ids to check, so the backend says which ones lack a value instead.
      if (!selectAll && withVariables.length > 0) {
        const gaps = await readGaps(accessToken, traceUuids);
        if (gaps !== null) {
          if (gaps) setMissing(gaps);
          return;
        }
      }
      try {
        await convert(false);
      } catch (err) {
        const refused = convertMissingValues(err);
        if (!refused) throw err;
        const ids = Array.from(new Set(refused.map((m) => m.trace_id)));
        const gaps = await readGaps(accessToken, ids);
        if (gaps === undefined) return;
        if (!gaps) throw err;
        setMissing(gaps);
      }
    } catch (err) {
      showFailure(err);
    } finally {
      setSubmitting(false);
    }
  };

  const addWithoutThem = async () => {
    setSkipping(true);
    try {
      await convert(true);
    } catch (err) {
      setMissing(null);
      showFailure(err);
    } finally {
      setSkipping(false);
    }
  };

  const count = traceCount ?? traceUuids.length;
  const showPicker = needsEvaluator && !(stepped && step === 1);

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
            <div>
              {/* Heading and description as in AddTestDialog. */}
              <label
                htmlFor="convert-test-name"
                className={`block text-base font-medium text-foreground ${
                  suggested.from ? "" : "mb-2"
                }`}
              >
                Name of the test
              </label>
              {suggested.from && (
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  {suggested.from === "comment"
                    ? "Automatically filled in from the comment given with the feedback"
                    : "Automatically filled in from the user's message"}
                </p>
              )}
              <input
                id="convert-test-name"
                autoFocus
                value={typedName ?? suggested.name}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full h-9 md:h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>
          )}
          {needsEvaluator && !showPicker ? null : needsEvaluator && loading ? (
            <LoadingState />
          ) : (
            <>
              {needsEvaluator ? (
                <AgentEvaluatorStep
                  list={list}
                  agentUuid={agentUuid}
                  accessToken={accessToken}
                  agentNature={agentNature}
                  heading={
                    <p className="text-sm font-medium text-foreground">
                      Pick at least one evaluator for evaluating the
                      agent&apos;s performance
                    </p>
                  }
                  emptyLead={`Each test needs at least one evaluator to score the agent's ${
                    agentNature === "general" ? "output" : "reply"
                  }.`}
                  error={error ?? loadError}
                  onSetUp={onEvaluatorSetUp}
                  traces={selectAll ? [] : stepTraces(traceUuids)}
                  fromTrace={fromTrace}
                  outcome="tests"
                  selectedFirst
                />
              ) : (
                <p className="text-sm text-foreground">
                  The resulting tests will consider the tool calls recorded in{" "}
                  {count === 1 ? "this trace" : "these traces"} as the expected
                  output. This can be changed later for each test.
                </p>
              )}
              {!needsEvaluator && error && <ErrorNote>{error}</ErrorNote>}
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
          {stepped ? (
            step === 2 && (
              <Button
                variant="secondary"
                size="md"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                Back
              </Button>
            )
          ) : (
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </Button>
          )}
          {stepped && step === 1 ? (
            <Button
              size="md"
              onClick={() => setStep(2)}
              disabled={name.length === 0}
            >
              Next
            </Button>
          ) : (
            <Button
              size="md"
              onClick={() => void submit()}
              disabled={!canSubmit}
            >
              {submitting ? "Adding..." : "Add to tests"}
            </Button>
          )}
        </div>
      </div>

      {missing && (
        <MissingValuesDialog
          missing={missing}
          totalTraces={count}
          outcome="tests"
          agentNature={agentNature}
          hasOtherEvaluators={withVariables.length < chosen.length}
          busy={skipping}
          onBack={() => setMissing(null)}
          onConfirm={() => void addWithoutThem()}
        />
      )}
    </div>
  );
}
