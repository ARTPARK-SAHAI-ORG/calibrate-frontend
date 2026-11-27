import type { EvaluatorType } from "@/components/EvaluatorPills";
import type { AgentNature } from "@/components/traces/ingestSnippets";
import type { EvaluatorData } from "./evaluatorApi";
import { fitsTaskType } from "./labellingItem";
import type {
  TraceScoringIneligibleReason,
  TraceScoringStatus,
  TraceSummary,
} from "./tracesApi";

export const METADATA_SOURCE = "metadata.";

const CONVERSATION_SOURCES = [
  { value: "input", label: "Conversation" },
  { value: "output.response", label: "Agent reply" },
  { value: "output.tool_calls", label: "Tool calls" },
  { value: METADATA_SOURCE, label: "Metadata" },
  { value: "labels", label: "Labels" },
  { value: "conversation_id", label: "Conversation ID" },
  { value: "message_id", label: "Message ID" },
];

// A general agent has no conversation, so nothing to identify one by.
const GENERAL_SOURCES = [
  { value: "input", label: "Input" },
  { value: "output.response", label: "Output" },
  { value: "output.tool_calls", label: "Tool calls" },
  { value: METADATA_SOURCE, label: "Metadata" },
  { value: "labels", label: "Labels" },
];

export const isMetadataSource = (source: string) =>
  source.startsWith(METADATA_SOURCE);
export const metadataKey = (source: string) =>
  source.slice(METADATA_SOURCE.length).trim();

/** The parts of a trace a variable can read from, for this kind of agent. */
export function traceSources(agentNature: AgentNature) {
  return agentNature === "general" ? GENERAL_SOURCES : CONVERSATION_SOURCES;
}

/**
 * The name of a part of a trace. With no agent type, the input keeps a name that
 * is true of both kinds of agent. A value this agent's list does not offer still
 * gets its name, and one nothing has a name for reads as it is.
 */
export function traceSourceLabel(
  source: string,
  agentNature?: AgentNature,
): string {
  const first =
    agentNature === "general"
      ? GENERAL_SOURCES
      : agentNature
        ? []
        : [{ value: "input", label: "Input" }];
  return (
    [...first, ...CONVERSATION_SOURCES].find((s) => s.value === source)?.label ??
    source
  );
}

export const lowerFirst = (text: string) => text[0].toLowerCase() + text.slice(1);

/** The part of a trace a variable is mapped to, to follow "is mapped to". */
export function missingSourcePhrase(
  source: string,
  agentNature?: AgentNature,
): string {
  return `the trace's ${lowerFirst(traceSourceLabel(source, agentNature))}`;
}

/**
 * The rows that say where a variable reads from. Rows left as Not set, and
 * Metadata rows with no key yet, say nothing and are left out.
 */
export function traceChoices(
  values: Record<string, string>,
): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const [name, value] of Object.entries(values)) {
    const source = isMetadataSource(value)
      ? METADATA_SOURCE + metadataKey(value)
      : value;
    if (source && source !== METADATA_SOURCE) choices[name] = source;
  }
  return choices;
}

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

/** The variables of an evaluator that have no trace value saved for this agent. */
export function missingTraceValues(evaluator: EvaluatorData) {
  return (evaluator.live_version?.variables ?? []).filter(
    (variable) => !evaluator.trace_variables?.[variable.name],
  );
}

export function isMissingTraceValue(evaluator: EvaluatorData) {
  return missingTraceValues(evaluator).length > 0;
}

export function fitsAgent(evaluator: EvaluatorData, agentNature: AgentNature) {
  return fitsTaskType(
    evaluator.evaluator_type ?? undefined,
    agentTaskType(agentNature),
  );
}

/** An evaluator of a type that scores this agent's traces, with variables to fill from them. */
export function takesTraceValues(
  evaluator: EvaluatorData,
  agentNature: AgentNature,
) {
  return (
    fitsAgent(evaluator, agentNature) &&
    !!evaluator.live_version?.variables?.length
  );
}

/** One that takes trace values and still has a variable with none chosen. */
export function needsTraceValues(
  evaluator: EvaluatorData,
  agentNature: AgentNature,
) {
  return takesTraceValues(evaluator, agentNature) && isMissingTraceValue(evaluator);
}

export const EVERY_EVALUATOR_NEEDS_VALUES =
  "None of the evaluators added to this agent have been configured for traces.";

/** Whether every evaluator that cannot score is only waiting for trace values. */
export const everyEvaluatorNeedsValues = (ineligible: { reason: string }[]) =>
  ineligible.length > 0 &&
  ineligible.every((item) => item.reason === "declares_variables");

export const NOT_CONFIGURED_FOR_TRACES = "Has not been configured for traces";

const NOTHING_CAN_SCORE_BY_REASON: Record<
  TraceScoringIneligibleReason,
  { one: string; every: string; some: string; fix: string }
> = {
  declares_variables: {
    one: `${NOT_CONFIGURED_FOR_TRACES}. Set it up in the Evaluators tab`,
    every: EVERY_EVALUATOR_NEEDS_VALUES,
    some: "some have not been configured for traces",
    fix: "Configure them in the",
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

// Said for a reason this app does not know yet, rather than failing.
const UNKNOWN_REASON = {
  one: "Cannot score traces",
  every: "None of the evaluators added to this agent can score its traces.",
  some: "some cannot score traces",
  fix: "Add an evaluator that can in the",
};

/** Why a linked evaluator cannot score this agent's traces. */
export function ineligibleReasonCopy(
  reason: TraceScoringIneligibleReason,
): string {
  return (NOTHING_CAN_SCORE_BY_REASON[reason] ?? UNKNOWN_REASON).one;
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
  const copies = [
    ...new Set(
      ineligible.map(
        (item) => NOTHING_CAN_SCORE_BY_REASON[item.reason] ?? UNKNOWN_REASON,
      ),
    ),
  ];
  if (copies.length === 1) {
    return `${copies[0].every} ${copies[0].fix}`;
  }
  return `None of this agent's evaluators can score traces: ${copies.map((copy) => copy.some).join(", ")}. Add an evaluator that can score traces in the`;
}

/** A failed run's `error` is the reason calibrate gave, not a code. */
export function scoringFailedCopy(error: string | null | undefined): string {
  return error ? `Scoring failed: ${error}` : "Scoring failed";
}

/**
 * Why a scoring run was skipped.
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
    case "missing_trace_values":
      return "This trace is missing a value that its evaluators need";
    default:
      return "Scoring did not finish";
  }
}
