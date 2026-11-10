import type { AgentNature } from "@/components/traces/ingestSnippets";
import type { EvaluatorData } from "./evaluatorApi";
import type {
  TraceScoringIneligibleReason,
  TraceScoringStatus,
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

const lowerFirst = (text: string) => text[0].toLowerCase() + text.slice(1);

/** The part of a trace a variable reads from, to follow "reads from". */
export function missingSourcePhrase(
  source: string,
  agentNature?: AgentNature,
): string {
  return isMetadataSource(source)
    ? `the metadata entry ${metadataKey(source)}`
    : `the ${lowerFirst(traceSourceLabel(source, agentNature))}`;
}

/** What a trace is missing, when it has nothing for a variable to read. */
export function emptyValueCopy(
  source: string,
  agentNature?: AgentNature,
): string {
  return isMetadataSource(source)
    ? `This trace has no metadata entry called ${metadataKey(source)}`
    : `This trace has no ${lowerFirst(traceSourceLabel(source, agentNature))}`;
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

/**
 * The `POST /traces` body that fills these variables, each one named at the
 * place it reads from. The rest is example text. A real request also names its
 * agent, which is no part of what these variables need.
 */
export function traceBodyExample(
  agentNature: AgentNature,
  choices: Record<string, string>,
): Record<string, unknown> {
  const parts = new Map<string, string>();
  for (const [variable, source] of Object.entries(traceChoices(choices))) {
    const earlier = parts.get(source);
    parts.set(source, `${earlier ? `${earlier} ` : ""}<${variable}>`);
  }
  const input = parts.get("input") ?? "The user's message";
  const toolCalls = parts.get("output.tool_calls");
  const messageId = parts.get("message_id");
  const conversationId = parts.get("conversation_id");
  const labels = parts.get("labels");
  const metadata = [...parts]
    .filter(([source]) => isMetadataSource(source))
    .map(([source, value]) => ({ key: metadataKey(source), value }));
  return {
    input:
      agentNature === "general" ? input : [{ role: "user", content: input }],
    output: {
      response: parts.get("output.response") ?? "The agent's reply",
      ...(toolCalls && {
        tool_calls: [{ tool: toolCalls, arguments: { date: "2026-03-14" } }],
      }),
    },
    ...(messageId && { message_id: messageId }),
    ...(conversationId && { conversation_id: conversationId }),
    ...(labels && { labels: [labels] }),
    ...(metadata.length > 0 && { metadata }),
  };
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

export const EVERY_EVALUATOR_NEEDS_VALUES =
  "Every evaluator added to this agent has a variable with no trace value chosen.";

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
      return "A variable has no trace value chosen. Configure it in the Evaluators tab";
    default:
      return "Cannot score traces for this agent";
  }
}

/**
 * Why an agent with evaluators still cannot score its traces. The usual cause
 * is a variable with no trace value chosen, so that case says so plainly rather
 * than leaving the reader to guess.
 */
export function nothingCanScoreCopy(ineligible: { reason: string }[]): string {
  if (ineligible.length === 0) {
    return "This agent has no evaluators, so its traces are not scored.";
  }
  if (ineligible.every((item) => item.reason === "declares_variables")) {
    return `${EVERY_EVALUATOR_NEEDS_VALUES} Configure them in the Evaluators tab.`;
  }
  return "None of this agent's evaluators can score traces.";
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
    case "no_usable_evaluators":
      return "No evaluators could score this trace";
    case "scoring_disabled":
      return "Monitoring was turned off before this trace was scored";
    case "unsupported_interaction_type":
      return "This kind of agent cannot be scored yet";
    case "no_reply":
      return "This turn has tool calls and no reply, so there was nothing to score";
    case "missing_trace_values":
      return "This trace is missing a value that its evaluators need";
    default:
      return "Scoring did not finish";
  }
}
