import type {
  TraceScoringIneligibleReason,
  TraceScoringStatus,
  TraceSummary,
} from "./tracesApi";

/** The only two things about a trace's output that decide how it is labelled.
 * The traces list has them as a preview and a count, the labelling dialog has
 * them as the fetched output; both boil down to the same pair. */
export type TraceOutputFacts = {
  hasResponse: boolean;
  hasToolCalls: boolean;
};

/** True when the output is a tool call and nothing else. Such a trace is built
 * as a tool-call item (a person marks it correct or wrong) rather than a
 * response item. A trace that also replied is a response item, and its call
 * rides along in the conversation. */
export function isToolCallOutput({
  hasResponse,
  hasToolCalls,
}: TraceOutputFacts): boolean {
  return !hasResponse && hasToolCalls;
}

/** The two facts the labelling and scoring rules need, read off a list row.
 * The row carries a preview of the reply and a count of the calls, not the
 * output itself, so this is where that shape is turned into the shared one. */
export function traceRowOutputFacts(
  trace: Pick<TraceSummary, "response_preview" | "tool_call_count">,
): TraceOutputFacts {
  return {
    hasResponse: !!trace.response_preview?.trim(),
    hasToolCalls: trace.tool_call_count > 0,
  };
}

/** A run that is still open and should be refetched. */
export function isTraceScoringInProgress(
  status: TraceScoringStatus | null | undefined,
): boolean {
  return status === "pending" || status === "processing";
}

/** Why a linked evaluator cannot score this agent's traces. */
export function ineligibleReasonCopy(
  reason: TraceScoringIneligibleReason | string,
): string {
  switch (reason) {
    case "wrong_type_for_agent":
      return "Is not the kind of evaluator this agent uses";
    case "no_live_version":
      return "Has no live version";
    case "declares_variables":
      return "Uses variables, which cannot be filled for a trace automatically";
    default:
      return "Cannot score traces for this agent";
  }
}

const NOTHING_CAN_SCORE_BY_REASON: Record<
  TraceScoringIneligibleReason,
  { every: string; some: string; fix: string }
> = {
  declares_variables: {
    every:
      "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically.",
    some: "some use variables",
    fix: "Add an evaluator without variables in the",
  },
  wrong_type_for_agent: {
    every:
      "None of the evaluators added to this agent are the kind that can score its traces.",
    some: "some are not the kind this agent uses",
    fix: "Add an evaluator that fits this agent in the",
  },
  no_live_version: {
    every: "None of the evaluators added to this agent have a live version.",
    some: "some have no live version",
    fix: "Add an evaluator with a live version in the",
  },
};

/**
 * Why an agent's traces are not being scored, and what to do about it. The
 * text ends with "in the", because the caller follows it with a link to the
 * Evaluators tab.
 */
export function nothingCanScoreCopy(ineligible: { reason: string }[]): string {
  if (ineligible.length === 0) {
    return "This agent has no evaluators, so its traces are not scored. Add one in the";
  }
  const reasons = [...new Set(ineligible.map((item) => item.reason))];
  const known = reasons.flatMap(
    (reason) =>
      NOTHING_CAN_SCORE_BY_REASON[reason as TraceScoringIneligibleReason] ?? [],
  );
  if (reasons.length === 1 && known.length === 1) {
    return `${known[0].every} ${known[0].fix}`;
  }
  const why = known.length
    ? `None of this agent's evaluators can score traces: ${known.map((copy) => copy.some).join(", ")}.`
    : "None of this agent's evaluators can score traces.";
  return `${why} Add an evaluator that can score traces in the`;
}

/**
 * Why a scoring run was skipped or failed.
 *
 * The backend also has `trace_deleted` and `agent_deleted`, which no reader
 * can reach: a run abandoned because its trace or its agent went away has no
 * row left to show it on. They fall through to the general line.
 */
export function scoringRunErrorCopy(error: string | null | undefined): string {
  switch (error) {
    case "over_limit":
      return "This workspace has reached its limit for scoring traces";
    case "no_tool_call_evaluator":
      return "This agent had no tool call evaluator when this trace arrived";
    case "no_usable_evaluators":
      return "No evaluator on this agent fits this trace";
    case "scoring_disabled":
      return "Monitoring was turned off before this trace was scored";
    case "unsupported_interaction_type":
      return "This kind of agent cannot be scored yet";
    default:
      return "Scoring did not finish";
  }
}
