"use client";

import { useHideFloatingButton } from "@/components/AppLayout";
import { AlertIcon, CheckCircleIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import type { AgentNature } from "./ingestSnippets";
import {
  VariableFromSource,
  type TraceVariableOutcome,
} from "./TraceVariableValues";

export type MissingValues = {
  evaluators: {
    uuid: string;
    name: string;
    variables: { name: string; source: string }[];
  }[];
  traces: {
    traceId: string;
    label: string;
    /** Keyed by evaluator uuid, then variable name. */
    values: Record<string, Record<string, string | null>>;
  }[];
};

const valueOf = (
  trace: MissingValues["traces"][number],
  evaluatorUuid: string,
  variable: string,
) => trace.values[evaluatorUuid]?.[variable] ?? null;

/**
 * Asked before adding traces when some of them have nothing for a variable an
 * evaluator reads. Lists only those traces, with what each one has.
 */
export function MissingValuesDialog({
  missing: { evaluators, traces },
  totalTraces,
  outcome,
  onBack,
  onConfirm,
  busy = false,
  agentNature,
  hasOtherEvaluators = false,
}: {
  missing: MissingValues;
  totalTraces: number;
  outcome: TraceVariableOutcome;
  onBack: () => void;
  onConfirm: () => void;
  busy?: boolean;
  agentNature?: AgentNature;
  /** An evaluator with no variables is also ticked, so every trace keeps at
   *  least that one. */
  hasOtherEvaluators?: boolean;
}) {
  useHideFloatingButton(true);

  const columns = evaluators.flatMap((ev) =>
    ev.variables.map((v) => ({ evaluator: ev, variable: v })),
  );
  const incomplete = traces.filter((t) =>
    columns.some(
      ({ evaluator, variable }) =>
        valueOf(t, evaluator.uuid, variable.name) === null,
    ),
  );
  const missing = incomplete.length;
  const complete = totalTraces - missing;
  // A test needs an evaluator, so when every trace lacks a value for each
  // evaluator ticked, there is nothing to add.
  const nothingToAdd =
    outcome === "tests" &&
    !hasOtherEvaluators &&
    complete === 0 &&
    incomplete.every((t) =>
      evaluators.every((ev) =>
        ev.variables.some((v) => valueOf(t, ev.uuid, v.name) === null),
      ),
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-6xl max-h-full flex flex-col p-5 md:p-8 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          {missing > 1
            ? "Some traces are missing a value"
            : totalTraces === 1
              ? "This trace is missing a value"
              : "A trace is missing a value"}
        </h2>
        {nothingToAdd ? (
          <p className="text-sm md:text-base text-foreground mb-5">
            No test can be added.{" "}
            {totalTraces === 1
              ? evaluators.length === 1
                ? "This trace has no value for the only evaluator you picked."
                : "This trace has no value for any evaluator you picked."
              : "None of these traces has a value for any evaluator you picked."}{" "}
            Go back and pick another evaluator, or set this one up to read a
            different part of the trace
          </p>
        ) : (
        <p className="text-sm md:text-base text-foreground mb-5">
          <span className="font-semibold">
            {missing} of {totalTraces}
          </span>{" "}
          {totalTraces === 1 ? "trace" : "traces"}{" "}
          {missing === 1 ? "is" : "are"} missing a value.{" "}
          {outcome === "tests"
            ? missing === 1
              ? "This test is added without the evaluator it has no value for. If that leaves it with no evaluator, it is not added."
              : "Each of these tests is added without the evaluator it has no value for. A trace left with no evaluator is not added."
            : missing === 1
              ? "This item is added with that value left blank."
              : "These items are added with that value left blank."}
          {complete > 0 &&
            (complete === 1
              ? " The other trace has every value."
              : ` The other ${complete} traces have every value.`)}
        </p>
        )}
        <div className="min-h-0 overflow-auto border border-border rounded-md mb-6">
          <table className="w-full text-sm md:text-base">
            <thead className="bg-muted/30">
              <tr>
                <th className="w-1/4 px-5 py-4 text-left align-top text-sm font-semibold text-foreground">
                  Trace
                </th>
                {columns.map(({ evaluator, variable }) => (
                  <th
                    key={`${evaluator.uuid}:${variable.name}`}
                    className="px-5 py-4 text-left align-top font-normal"
                  >
                    <div className="text-sm font-semibold text-foreground mb-2">
                      {evaluator.name}
                    </div>
                    <VariableFromSource
                      variable={variable.name}
                      source={variable.source}
                      agentNature={agentNature}
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {incomplete.map((trace) => (
                <tr key={trace.traceId} className="border-t border-border">
                  <td className="px-5 py-4 align-top text-foreground break-words">
                    {trace.label}
                  </td>
                  {columns.map(({ evaluator, variable }) => {
                    const value = valueOf(trace, evaluator.uuid, variable.name);
                    return (
                      <td
                        key={`${evaluator.uuid}:${variable.name}`}
                        className="px-5 py-4 align-top"
                      >
                        {value === null ? (
                          <span className="inline-flex items-center gap-2 text-red-600 dark:text-red-400">
                            <AlertIcon className="w-4 h-4 flex-shrink-0" />
                            Value missing
                          </span>
                        ) : (
                          <span className="flex items-start gap-2 text-foreground">
                            <CheckCircleIcon className="w-4 h-4 mt-0.5 flex-shrink-0 text-emerald-600 dark:text-emerald-400" />
                            <span className="whitespace-pre-wrap break-words min-w-0">
                              {value}
                            </span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <Button variant="secondary" size="md" onClick={onBack} disabled={busy}>
            Back
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={onConfirm}
            isLoading={busy}
            disabled={nothingToAdd}
          >
            {outcome === "tests" ? "Add without them" : "Add with them blank"}
          </Button>
        </div>
      </div>
    </div>
  );
}
