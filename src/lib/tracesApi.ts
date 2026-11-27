import type { MetadataEntry } from "@/components/ui";
import { MAX_METADATA_ENTRIES } from "@/components/human-labelling/MetadataFieldsEditor";
import { apiGet, apiPost, apiPut, getBackendUrl, Paginated } from "./api";

/** One turn of stored conversation history, OpenAI chat format. Extra keys
 *  (`tool_calls`, `tool_call_id`, `name`, ...) are preserved by the backend
 *  verbatim, hence the open index signature. */
export type TraceTurn = {
  role: string;
  content?: string | null;
  [key: string]: unknown;
};

/** A tool call the agent issued, in the flat expected-tool-call shape tests
 *  use (`{tool, arguments}`), not OpenAI's nested `function` form. */
export type TraceToolCall = {
  tool: string;
  arguments?: Record<string, unknown> | null;
  /** What the tool returned, when the agent ran it and sent the result in.
   * Any JSON value. Absent when the agent only reported the call. */
  output?: unknown;
};

export type TraceOutput = {
  response?: string | null;
  tool_calls?: TraceToolCall[] | null;
  /** True when the agent kept calling tools until it was stopped, unreplied. */
  stopped_early?: boolean | null;
};

/** Slim list row from `GET /traces` — previews and counts only; the full
 *  bodies live on the detail endpoint. */
export type TraceSummary = {
  uuid: string;
  agent_id: string;
  message_id: string | null;
  conversation_id: string | null;
  input_preview: string | null;
  response_preview: string | null;
  /** Tools the agent called on this turn, in order. Empty when the turn was
   * a text reply only. Used as the Output-column fallback when `tool_calls`
   * is absent. */
  tool_names?: string[] | null;
  /** Slim tool calls (name + arguments) for the Output column. */
  tool_calls?: TraceToolCall[] | null;
  /** The tags sent with the trace at ingest. Empty when none were sent. */
  labels?: string[] | null;
  turn_count: number;
  tool_call_count: number;
  metadata_count: number;
  created_at: string;
  /** Latest scoring run for this trace. Absent when scoring has never run. */
  latest_run_status?: TraceScoringStatus | null;
  /** A skipped run's reason code, e.g. "over_limit", or a failed run's error text. */
  latest_run_error?: string | null;
  /** One entry per evaluator on the latest completed run, the same shape a
   *  scoring run carries. Empty until the run finishes. */
  results?: TraceScoreResult[] | null;
  /** "chat" when the trace came from the agent's chat link, else "api". */
  source?: TraceSource;
  /** The thumb and comment left on the reply in the chat link, if any. */
  feedback?: TraceFeedback | null;
};

/** Where a trace came from: the customer's app, or the agent's chat link. */
export type TraceSource = "api" | "chat";

/** What the person on the chat link said about a reply: true is a thumbs up,
 *  false a thumbs down. */
export type TraceFeedback = {
  is_correct: boolean;
  comment: string | null;
  at: string;
};

/** Status of one durable trace-scoring run. */
export type TraceScoringStatus =
  "pending" | "processing" | "completed" | "failed" | "skipped";

export type TraceScoreResult = {
  evaluator_uuid: string;
  name: string;
  output_type: "binary" | "rating";
  scale_min?: number | null;
  scale_max?: number | null;
  /** The judged result: 0 or 1 for binary, the numeric score for rating. */
  value: number;
  reasoning?: string | null;
  passed: boolean;
};

/** A variable that could not be filled because this trace lacks its source. */
export type TraceUnconfiguredEvaluator = {
  evaluator_uuid: string;
  name: string;
};

export type TraceMissingValue = TraceUnconfiguredEvaluator & {
  variable: string;
  source: string;
};

export type TraceScoringRun = {
  run_uuid: string;
  status: TraceScoringStatus;
  created_at: string;
  completed_at?: string | null;
  error?: string | null;
  results: TraceScoreResult[];
  /** Absent on runs from before the backend reported these. */
  missing_values?: TraceMissingValue[];
  /** Evaluators left out of this run because they had not been configured
   *  for traces. */
  unconfigured_evaluators?: TraceUnconfiguredEvaluator[];
  /** The only evaluators this run judges, when it scores a trace again for
   *  evaluators set up after it was first scored. Empty for a normal run. */
  newly_scored_evaluators?: TraceUnconfiguredEvaluator[];
};

export type TraceScoringIneligibleReason =
  "wrong_type_for_agent" | "no_live_version" | "declares_variables";

export type TraceScoringEligibleEvaluator = {
  evaluator_uuid: string;
  name: string;
};

export type TraceScoringIneligibleEvaluator = {
  evaluator_uuid: string;
  name: string;
  reason: TraceScoringIneligibleReason;
};

export type TraceScoringEligibility = {
  eligible: TraceScoringEligibleEvaluator[];
  ineligible: TraceScoringIneligibleEvaluator[];
};

export type TraceDetail = {
  uuid: string;
  agent_id: string;
  message_id: string | null;
  conversation_id: string | null;
  /** A conversational agent stores the history as turns. A general agent
   * answers one input at a time, so it stores that input as plain text. */
  input: TraceTurn[] | string;
  output: TraceOutput;
  metadata: MetadataEntry[] | null;
  labels?: string[] | null;
  created_at: string;
  updated_at: string;
  source?: TraceSource;
  feedback?: TraceFeedback | null;
};

/** What a trace adds to a labelling item's metadata: its own entries, then its
 * conversation id, message id and labels. A labelling item holds as many
 * entries as a trace, so the last three are dropped when the trace is full. */
export function traceLabellingMetadata(trace: TraceDetail): MetadataEntry[] {
  const entries = [...(trace.metadata ?? [])];
  if (trace.conversation_id) {
    entries.push({ key: "conversation_id", value: trace.conversation_id });
  }
  if (trace.message_id) {
    entries.push({ key: "message_id", value: trace.message_id });
  }
  if (trace.labels?.length) {
    entries.push({ key: "labels", value: trace.labels.join(", ") });
  }
  return entries.slice(0, MAX_METADATA_ENTRIES);
}

/**
 * The stored input as turns, whichever shape it arrived in. A general agent's
 * plain text becomes the one user turn it stands for, so everything reading a
 * trace works the same either way.
 */
export function traceInputTurns(
  input: TraceTurn[] | string | null | undefined,
): TraceTurn[] {
  if (typeof input === "string") {
    return input.trim() ? [{ role: "user", content: input }] : [];
  }
  return input ?? [];
}

/** The backend caps a page at 200 rows. */
export const MAX_TRACES_PAGE_SIZE = 200;

/** What the agent did on the turn: replied, or called tools instead. */
export type TraceOutputType = "response" | "tool_call";

/** The output filter, where "all" means no filter at all. */
export type TraceOutputFilter = "all" | TraceOutputType;

/** One evaluator's running average across every trace the filters match, not
 *  just the page. A yes-or-no evaluator averages ones and zeros, so its mean
 *  is the share that passed. */
export type TraceScoreAverage = {
  evaluator_uuid: string;
  name: string;
  output_type: "binary" | "rating";
  /** How many traces this evaluator has scored. */
  traces_scored: number;
  /** The mean of its scores. A yes-or-no evaluator averages ones and zeros,
   *  so this is the share that passed. */
  average: number;
  scale_min?: number | null;
  scale_max?: number | null;
};

/**
 * One condition per evaluator, keyed by the evaluator's id. A trace is listed
 * only when every one of them holds against its latest scoring run.
 *
 * A condition is either `passed` / `failed`, which read the same verdict the
 * table shows, or a comparison against a rating's number: `=4`, `!=4`, `<4`,
 * `<=4`, `>4`, `>=4`.
 */
export type TraceScoreFilters = Record<string, string>;

/**
 * The repeated `score` value both the list and the bulk endpoints read, one
 * `evaluator:condition` per entry. Written once here so the two callers cannot
 * disagree about the format.
 */
export function traceScoreParams(scores?: TraceScoreFilters): string[] {
  return Object.entries(scores ?? {})
    .filter(([uuid, condition]) => uuid && condition)
    .map(([uuid, condition]) => `${uuid}:${condition}`);
}

/** The source filter, where "all" means no filter at all. */
export type TraceSourceFilter = "all" | TraceSource;

/** The feedback filter: a thumb up, a thumb down, or either. */
export type TraceFeedbackFilter = "all" | "correct" | "wrong" | "any";

/** Which way a sorted column runs. */
export type TraceSortOrder = "asc" | "desc";

/** What a reader can narrow the list by, as the tab holds it. The one
 *  definition: a new filter is added here, in `traceFilterFields`, and in the
 *  places that draw it. */
export type TraceFacets = {
  /** Keep only the traces whose output has a reply ("response") or whose
   *  output has tool calls and no reply ("tool_call"). "all" keeps everything
   *  and is left off the request. */
  outputType: TraceOutputFilter;
  /** Keep only traces carrying any of these labels, matched exactly and
   *  case-sensitively. An empty list is left off the request. */
  labels: string[];
  /** Keep only traces whose latest scores match every one of these
   *  conditions. An empty set is left off the request. */
  scores: TraceScoreFilters;
  /** Keep only the turns of this conversation. */
  conversationId: string | null;
  /** Keep only the traces from the customer's app or from the chat link. */
  source: TraceSourceFilter;
  /** Keep only the traces with this feedback from the chat link. */
  feedback: TraceFeedbackFilter;
};

export const NO_TRACE_FACETS: TraceFacets = {
  outputType: "all",
  labels: [],
  scores: {},
  conversationId: null,
  source: "all",
  feedback: "all",
};

/** Which traces a list shows. */
export type TraceFilters = {
  /** Traces belong to one agent; every read is scoped to it. */
  agentId: string;
  /** Plain "contains this text" match, case-insensitive, over the message id,
   *  conversation id, conversation history, reply, and metadata. Blank is
   *  ignored by the backend, and left off here. */
  q?: string;
} & Partial<TraceFacets>;

export type TraceListParams = TraceFilters & {
  limit: number;
  offset: number;
  /** Ask for `score_averages` beside the page. Costly, so only when the
   *  filters change rather than on every page or poll. */
  includeScoreAverages?: boolean;
  /** Order by this evaluator's score rather than newest first. Traces it has
   *  not scored come last whichever way the order runs, since an unscored
   *  trace is unknown rather than zero. */
  sortByEvaluator?: string | null;
  /** Which way `sortByEvaluator` runs. Ignored without it. */
  sortOrder?: TraceSortOrder;
  /** Keep only traces created before this time. Not a list filter, so it is
   *  not in `TraceFilters`: see `TraceSelectAll`. */
  createdBefore?: string | null;
};

/** The request fields for a set of filters, the same in a query string and in
 *  a bulk request's body. Anything left at its default is left off. */
function traceFilterFields(f: TraceFilters): Record<string, string | string[]> {
  const fields: Record<string, string | string[]> = { agent_id: f.agentId };
  const q = f.q?.trim();
  if (q) fields.q = q;
  if (f.outputType && f.outputType !== "all") fields.output_type = f.outputType;
  if (f.labels?.length) fields.labels = f.labels;
  if (f.conversationId) fields.conversation_id = f.conversationId;
  if (f.source && f.source !== "all") fields.source = f.source;
  if (f.feedback && f.feedback !== "all") fields.feedback = f.feedback;
  const score = traceScoreParams(f.scores);
  if (score.length) fields.score = score;
  return fields;
}

/**
 * Two sets of filters with the same key ask for the same traces, whatever
 * arrays or objects hold them and whichever order the score conditions are in.
 * `createdBefore` is deliberately not in it: choosing select all sets that, and
 * if that changed the key it would drop the ticks and select all with them.
 */
export function traceFilterKey(f: TraceFilters): string {
  return JSON.stringify({
    ...traceFilterFields(f),
    score: traceScoreParams(f.scores).sort(),
  });
}

function traceListQuery(f: TraceFilters, limit: number, offset: number) {
  const params = new URLSearchParams({
    limit: String(Math.min(limit, MAX_TRACES_PAGE_SIZE)),
    offset: String(offset),
  });
  for (const [name, value] of Object.entries(traceFilterFields(f))) {
    for (const entry of [value].flat()) params.append(name, entry);
  }
  return params;
}

/**
 * Fetch one page of traces for one agent. Unlike the other list pages this one
 * pages and searches on the server: the trace store can hold far more rows than
 * the client should ever download. It refuses a page larger than
 * `MAX_TRACES_PAGE_SIZE`.
 */
export async function fetchTraces(
  accessToken: string,
  listParams: TraceListParams,
): Promise<Paginated<TraceSummary> & { score_averages?: TraceScoreAverage[] }> {
  const { limit, offset, sortByEvaluator, sortOrder } = listParams;
  const params = traceListQuery(listParams, limit, offset);
  if (listParams.createdBefore) {
    params.set("created_before", listParams.createdBefore);
  }
  if (sortByEvaluator) {
    params.set("sort_by_evaluator", sortByEvaluator);
    params.set("sort_order", sortOrder ?? "desc");
  }
  // Averages read every matching trace, not the page, so they are asked for
  // when the filters change and left off while paging through the result.
  if (listParams.includeScoreAverages) {
    params.set("include_score_averages", "true");
  }
  return apiGet<
    Paginated<TraceSummary> & { score_averages?: TraceScoreAverage[] }
  >(`/traces?${params.toString()}`, accessToken);
}

/** One row of `GET /traces/conversations`: the traces one agent stored under
 *  one conversation ID. */
export type TraceConversation = {
  conversation_id: string;
  agent_id: string;
  first_turn_at: string;
  last_turn_at: string;
  /** The first user message in the conversation, shortened. */
  first_message_preview?: string | null;
  /** The newest trace. Its stored history plus its reply is the whole
   *  conversation. */
  last_turn: TraceSummary;
};

/** One page of an agent's conversations, newest activity first. Traces sent
 *  without a conversation ID are not part of any. */
export async function fetchTraceConversations(
  accessToken: string,
  listParams: Omit<
    TraceListParams,
    | "scores"
    | "sortByEvaluator"
    | "sortOrder"
    | "includeScoreAverages"
    | "createdBefore"
  >,
): Promise<Paginated<TraceConversation>> {
  const params = traceListQuery(
    listParams,
    listParams.limit,
    listParams.offset,
  );
  return apiGet<Paginated<TraceConversation>>(
    `/traces/conversations?${params.toString()}`,
    accessToken,
  );
}

/** Fetch one trace with its full conversation history, output, and metadata. */
export async function fetchTrace(
  accessToken: string,
  traceUuid: string,
): Promise<TraceDetail> {
  return apiGet<TraceDetail>(`/traces/${traceUuid}`, accessToken);
}

/** Every scoring run for this trace, newest first. */
export async function fetchTraceScores(
  accessToken: string,
  traceUuid: string,
): Promise<{ runs: TraceScoringRun[] }> {
  return apiGet<{ runs: TraceScoringRun[] }>(
    `/traces/${encodeURIComponent(traceUuid)}/scores`,
    accessToken,
  );
}

/** JWT-only: score a stored trace again, such as one skipped before a fitting
 *  evaluator was linked. */
export async function scoreTrace(
  accessToken: string,
  traceUuid: string,
): Promise<{ run_uuid: string; status: "pending" }> {
  return apiPost<{ run_uuid: string; status: "pending" }>(
    `/traces/${encodeURIComponent(traceUuid)}/score`,
    accessToken,
    {},
  );
}

export type TraceVariablePreview = {
  variable: string;
  source: string;
  /** The text the variable would get. Null when the trace does not have it. */
  value: string | null;
};

/** What these variables would read from one trace. Reads only, judges nothing. */
export async function previewTraceVariables(
  accessToken: string,
  agentUuid: string,
  traceId: string,
  traceVariables: Record<string, string>,
): Promise<{ values: TraceVariablePreview[] }> {
  return apiPost<{ values: TraceVariablePreview[] }>(
    `/agents/${encodeURIComponent(agentUuid)}/trace-variables/preview`,
    accessToken,
    { trace_id: traceId, trace_variables: traceVariables },
  );
}

export type TraceVariableValue = {
  variable: string;
  source: string;
  value: string | null;
};

export type TraceVariableValuesItem = {
  trace_id: string;
  evaluator_id: string;
  values: TraceVariableValue[];
};

/** The values each evaluator's variables would read from each trace, using
 *  the trace values saved on this agent. */
export async function fetchTraceVariableValues(
  accessToken: string,
  agentUuid: string,
  traceIds: string[],
  evaluatorIds: string[],
): Promise<TraceVariableValuesItem[]> {
  const { items } = await apiPost<{ items: TraceVariableValuesItem[] }>(
    `/agents/${encodeURIComponent(agentUuid)}/trace-variables/values`,
    accessToken,
    { trace_ids: traceIds, evaluator_ids: evaluatorIds },
  );
  return items;
}

/** JWT-only: which linked evaluators can score this agent's traces. */
export async function fetchTraceScoringEligibility(
  accessToken: string,
  agentUuid: string,
): Promise<TraceScoringEligibility> {
  return apiGet<TraceScoringEligibility>(
    `/agents/${encodeURIComponent(agentUuid)}/trace-scoring-eligibility`,
    accessToken,
  );
}

/**
 * The setting's home inside the agent's config. Saving replaces the whole
 * config rather than merging it, so everything already stored alongside the
 * setting is carried over. The one place that knows the path.
 */
export function configWithTraceScoring(
  storedConfig: Record<string, unknown>,
  enabled: boolean,
): Record<string, unknown> {
  const traces = (storedConfig.traces ?? {}) as Record<string, unknown>;
  const scoring = (traces.scoring ?? {}) as Record<string, unknown>;
  return {
    ...storedConfig,
    traces: { ...traces, scoring: { ...scoring, enabled } },
  };
}

/**
 * Whether this agent scores its new traces, read from its config the way the
 * backend reads it: on unless it was explicitly turned off. Read from the
 * config rather than a field beside it, because not every answer carries one.
 */
export function traceScoringEnabled(
  config: Record<string, unknown> | null | undefined,
): boolean {
  const traces = (config?.traces ?? {}) as Record<string, unknown>;
  const scoring = (traces.scoring ?? {}) as Record<string, unknown>;
  return scoring.enabled !== false;
}

/** Turn automatic scoring of newly ingested traces on or off. */
export async function setAgentTraceScoring(
  accessToken: string,
  agentUuid: string,
  storedConfig: Record<string, unknown>,
  enabled: boolean,
): Promise<{ config?: Record<string, unknown> }> {
  return apiPut<{ config?: Record<string, unknown> }>(
    `/agents/${encodeURIComponent(agentUuid)}`,
    accessToken,
    { config: configWithTraceScoring(storedConfig, enabled) },
  );
}

/** How many traces this workspace has stored and scored, against its limits. */
export type TraceUsage = {
  traces_stored: number;
  max_traces: number;
  traces_scored: number;
  /** Null means the workspace has no scoring limit. */
  max_scored_traces: number | null;
};

/** Whether any of the agent's traces matches this filter. */
export async function fetchHasTrace(
  accessToken: string,
  agentId: string,
  filter: Pick<TraceListParams, "feedback" | "outputType">,
): Promise<boolean> {
  const page = await fetchTraces(accessToken, {
    ...filter,
    agentId,
    limit: 1,
    offset: 0,
  });
  return page.total > 0;
}

export async function fetchTraceUsage(
  accessToken: string,
): Promise<TraceUsage> {
  return apiGet<TraceUsage>("/traces/usage", accessToken);
}

/** Every conversation ID on this agent's traces, newest activity first. */
export async function fetchTraceConversationIds(
  accessToken: string,
  agentId: string,
): Promise<string[]> {
  const data = await apiGet<{ conversation_ids?: string[] }>(
    `/traces/conversation-ids?agent_id=${encodeURIComponent(agentId)}`,
    accessToken,
  );
  return data.conversation_ids ?? [];
}

/**
 * The labels sent with this agent's traces, so the filter can offer them.
 * The list is server-paginated and holds one page, so the labels on screen
 * are never the whole set: they have to come from the backend.
 */
export async function fetchTraceLabels(
  accessToken: string,
  agentId: string,
): Promise<string[]> {
  const data = await apiGet<{ labels?: string[] } | string[]>(
    `/traces/labels?agent_id=${encodeURIComponent(agentId)}`,
    accessToken,
  );
  return Array.isArray(data) ? data : (data.labels ?? []);
}

/**
 * Check a pasted workspace API key without touching the signed-in session.
 * `apiGet` would attach the JWT and sign the user out on 401, so this is a
 * raw fetch with only `X-API-Key`. A 2xx for this agent means the key is real
 * and can see this workspace; 401 and 403 mean it is not. Anything else,
 * including a 404 for an agent that no longer exists, is not an answer about
 * the key, so it is thrown for the caller to report as "could not check".
 */
export async function validateApiKeyForAgent(
  apiKey: string,
  agentUuid: string,
): Promise<boolean> {
  const response = await fetch(
    `${getBackendUrl()}/agents/${encodeURIComponent(agentUuid)}`,
    {
      headers: {
        accept: "application/json",
        "X-API-Key": apiKey.trim(),
      },
    },
  );
  if (response.ok) return true;
  if (response.status === 401 || response.status === 403) return false;
  throw new Error(`Request failed: ${response.status}`);
}

export type ConvertTestType = "response" | "tool_call" | "general";

/** The list the reader is looking at, when they asked for every trace in it
 *  rather than the ones they ticked. The backend re-reads the same rows, so a
 *  page they never loaded is included and a stale tick cannot slip through.
 *  `createdBefore` is the moment they asked, so a trace that lands later is
 *  left alone. */
export type TraceSelectAll = TraceFilters & { createdBefore?: string | null };

/** Turn the filters into the fields both bulk endpoints read. */
export function selectAllBody(
  filters: TraceSelectAll,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    select_all: true,
    ...traceFilterFields(filters),
  };
  if (filters.createdBefore) body.created_before = filters.createdBefore;
  return body;
}

export type ConvertTracesToTestsBody = {
  traceIds: string[];
  /** Convert every trace the filters match, ignoring `traceIds`. */
  selectAll?: TraceSelectAll | null;
  type: ConvertTestType;
  /** Evaluators to link to each created test. Required for `response` and
   * `general`, rejected for `tool_call`. */
  evaluatorUuids?: string[];
  /** For `tool_call`: match only the tool name, ignore the recorded arguments. */
  acceptAnyArguments?: boolean;
  /** The test's name. Only when converting exactly one trace by its id. */
  name?: string;
  /** Make tests from the traces that have every value their evaluators need,
   *  and leave out the rest, rather than refusing the whole conversion. */
  skipMissingValues?: boolean;
};

/** The name a test made from one trace starts with: the comment left with the
 *  rating, else the user's message cut to 60 characters. */
export function defaultTestName(
  comment: string | null | undefined,
  userMessage: string | null | undefined,
): { name: string; from: "comment" | "message" | null } {
  const fromComment = comment?.trim();
  if (fromComment) return { name: fromComment, from: "comment" };
  const message = userMessage?.trim();
  if (!message) return { name: "", from: null };
  // By character, so an emoji at the cut is not split in half.
  const chars = Array.from(message);
  return {
    name:
      chars.length <= 60
        ? message
        : `${chars.slice(0, 60).join("").trimEnd()}…`,
    from: "message",
  };
}

export type ConvertTracesToTestsResult = {
  /** How many tests were created. */
  created: number;
  /** Their ids, in the order the traces were sent. */
  test_uuids: string[];
  /** What went wrong after the tests were made, in words for the reader. */
  warnings?: string[] | null;
};

/**
 * Convert selected traces into regression tests. `response` and `general`
 * tests re-run the agent and judge what it produced (each needs at least one
 * evaluator, of a type matching the agent); `tool_call` tests assert the
 * recorded tool calls and take no evaluators. Each created test is linked to the agent that produced
 * its trace, so nothing here names an agent. Backed by
 * `POST /traces/convert-to-tests`.
 */
export async function convertTracesToTests(
  accessToken: string,
  {
    traceIds,
    selectAll,
    type,
    evaluatorUuids,
    acceptAnyArguments,
    name,
    skipMissingValues,
  }: ConvertTracesToTestsBody,
): Promise<ConvertTracesToTestsResult> {
  const body: Record<string, unknown> = selectAll
    ? { ...selectAllBody(selectAll), type }
    : { trace_ids: traceIds, type };
  if (evaluatorUuids && evaluatorUuids.length) {
    body.evaluators = evaluatorUuids;
  }
  if (type === "tool_call") body.accept_any_arguments = !!acceptAnyArguments;
  if (name) body.name = name;
  if (skipMissingValues) body.skip_missing_values = true;
  return apiPost<ConvertTracesToTestsResult>(
    "/traces/convert-to-tests",
    accessToken,
    body,
  );
}

/**
 * When a conversion fails, the backend names what went wrong: which evaluators
 * cannot be used, or which traces have no tool calls or no longer exist. The
 * shared client throws that body inside its message, so dig it back out and
 * show it. Returns null when there is nothing better than a general message.
 */
export function convertTracesErrorMessage(error: unknown): string | null {
  const detail = convertErrorDetail(error);
  if (typeof detail === "string") return detail;
  if (!detail || typeof detail !== "object") return null;
  if (convertMissingValues(error)) {
    const { message } = detail as { message?: unknown };
    if (typeof message === "string") return message;
  }
  const {
    error: summary,
    evaluators,
    trace_ids: traceIds,
  } = detail as {
    error?: unknown;
    evaluators?: unknown;
    trace_ids?: unknown;
  };
  if (Array.isArray(evaluators) && evaluators.length) {
    return evaluators.filter((m) => typeof m === "string").join(" ");
  }
  const parts: string[] = [];
  if (typeof summary === "string") parts.push(summary);
  if (Array.isArray(traceIds) && traceIds.length) {
    parts.push(
      `${traceIds.length} trace${traceIds.length === 1 ? "" : "s"} could not be used.`,
    );
  }
  return parts.length ? parts.join(" ") : null;
}

// The `detail` of the backend body the shared client throws inside its message.
function convertErrorDetail(error: unknown): unknown {
  const text = error instanceof Error ? error.message : "";
  const start = text.indexOf("{");
  if (start < 0) return undefined;
  try {
    return (JSON.parse(text.slice(start)) as { detail?: unknown }).detail;
  } catch {
    return undefined;
  }
}

export type MissingTraceValue = {
  trace_id: string;
  evaluator_id: string;
  evaluator_name: string;
  variable: string;
  source: string;
};

/** The values a conversion was refused for, when that is why it failed. */
export function convertMissingValues(
  error: unknown,
): MissingTraceValue[] | null {
  const detail = convertErrorDetail(error) as { missing?: unknown } | undefined;
  return detail && typeof detail === "object" && Array.isArray(detail.missing)
    ? (detail.missing as MissingTraceValue[])
    : null;
}
