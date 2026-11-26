import type { EvaluatorType } from "@/components/EvaluatorPills";
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
 * as a tool-call item (judged by tool-call evaluators) rather than a
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

/** True when a list row's output is a tool call and nothing else. */
export function isToolCallTraceRow(
  trace: Pick<TraceSummary, "response_preview" | "tool_call_count">,
): boolean {
  return isToolCallOutput(traceRowOutputFacts(trace));
}

/** The evaluator kind that judges this agent's replies. Full-conversation
 * evaluators are hidden for now, so a conversation agent uses the next-reply
 * (`llm`) kind and a general agent the output kind. */
export function agentTaskType(
  agentNature: "conversation" | "general",
): EvaluatorType {
  return agentNature === "general" ? "llm-general" : "llm";
}

/** A run that is still open and should be refetched. */
export function isTraceScoringInProgress(
  status: TraceScoringStatus | null | undefined,
): boolean {
  return status === "pending" || status === "processing";
}

const NOTHING_CAN_SCORE_BY_REASON: Record<
  TraceScoringIneligibleReason,
  { one: string; every: string; some: string; fix: string }
> = {
  declares_variables: {
    one: "Uses variables, which cannot be filled for a trace automatically",
    every:
      "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically.",
    some: "some use variables",
    fix: "Add an evaluator without variables in the",
  },
  wrong_type_for_agent: {
    one: "Is not the kind of evaluator this agent uses",
    every:
      "None of the evaluators added to this agent are the kind that can score its traces.",
    some: "some are not the kind this agent uses",
    fix: "Add an evaluator that fits this agent in the",
  },
  no_live_version: {
    one: "Has no live version",
    every: "None of the evaluators added to this agent have a live version.",
    some: "some have no live version",
    fix: "Add an evaluator with a live version in the",
  },
};

/** Why a linked evaluator cannot score this agent's traces. */
export function ineligibleReasonCopy(
  reason: TraceScoringIneligibleReason,
): string {
  return NOTHING_CAN_SCORE_BY_REASON[reason].one;
}

/**
 * Why an agent's traces are not being scored, and what to do about it. The
 * text ends with "in the", because the caller follows it with a link to the
 * Evaluators tab.
 */
export function nothingCanScoreCopy(
  ineligible: { reason: TraceScoringIneligibleReason }[],
): string {
  if (ineligible.length === 0) {
    return "This agent has no evaluators, so its traces are not scored. Add one in the";
  }
  const copies = [...new Set(ineligible.map((item) => item.reason))].map(
    (reason) => NOTHING_CAN_SCORE_BY_REASON[reason],
  );
  if (copies.length === 1) {
    return `${copies[0].every} ${copies[0].fix}`;
  }
  return `None of this agent's evaluators can score traces: ${copies.map((copy) => copy.some).join(", ")}. Add an evaluator that can score traces in the`;
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
      return "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent";
    case "no_usable_evaluators":
      return "No evaluator on this agent could score this trace";
    case "scoring_disabled":
      return "Monitoring was turned off before this trace was scored";
    case "unsupported_interaction_type":
      return "This kind of agent cannot be scored yet";
    default:
      return "Scoring did not finish";
  }
}
