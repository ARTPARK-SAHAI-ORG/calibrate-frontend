import { apiGet, apiPost, getBackendUrl, Paginated } from "./api";

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
};

export type TraceMetadataEntry = {
  key: string;
  value: string;
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
  turn_count: number;
  tool_call_count: number;
  metadata_count: number;
  created_at: string;
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
  metadata: TraceMetadataEntry[] | null;
  created_at: string;
  updated_at: string;
};

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

export type TraceListParams = {
  limit: number;
  offset: number;
  /** Traces belong to one agent; every read is scoped to it. */
  agentId: string;
  /** Plain "contains this text" match, case-insensitive, over the message id,
   *  conversation id, conversation history, reply, and metadata. Blank is
   *  ignored by the backend, and left off here. */
  q?: string;
  /** Keep only the traces whose output has a reply ("response") or whose
   *  output has tool calls and no reply ("tool_call"). "all" keeps everything
   *  and is left off here. */
  outputType?: TraceOutputFilter;
};

/**
 * Fetch one page of traces for one agent. Unlike the other list pages this one
 * pages and searches on the server: the trace store can hold far more rows than
 * the client should ever download. It refuses a page larger than
 * `MAX_TRACES_PAGE_SIZE`.
 */
export async function fetchTraces(
  accessToken: string,
  { limit, offset, agentId, q, outputType }: TraceListParams,
): Promise<Paginated<TraceSummary>> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, MAX_TRACES_PAGE_SIZE)));
  params.set("offset", String(offset));
  params.set("agent_id", agentId);
  if (q?.trim()) params.set("q", q.trim());
  if (outputType && outputType !== "all") {
    params.set("output_type", outputType);
  }
  return apiGet<Paginated<TraceSummary>>(
    `/traces?${params.toString()}`,
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
 *  page they never loaded is included and a stale tick cannot slip through. */
export type TraceFilters = {
  agentId: string;
  q?: string;
  outputType?: TraceOutputFilter;
};

/** Turn the filters into the fields both bulk endpoints read. */
export function selectAllBody(filters: TraceFilters): Record<string, unknown> {
  const body: Record<string, unknown> = {
    select_all: true,
    agent_id: filters.agentId,
  };
  if (filters.q?.trim()) body.q = filters.q.trim();
  if (filters.outputType && filters.outputType !== "all") {
    body.output_type = filters.outputType;
  }
  return body;
}

export type ConvertTracesToTestsBody = {
  traceIds: string[];
  /** Convert every trace the filters match, ignoring `traceIds`. */
  selectAll?: TraceFilters | null;
  type: ConvertTestType;
  /** Evaluators to link to each created test. Required for `response` and
   * `general`, rejected for `tool_call`. */
  evaluatorUuids?: string[];
  /** For `tool_call`: match only the tool name, ignore the recorded arguments. */
  acceptAnyArguments?: boolean;
};

export type ConvertTracesToTestsResult = {
  /** How many tests were created. */
  created: number;
  /** Their ids, in the order the traces were sent. */
  test_uuids: string[];
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
  }: ConvertTracesToTestsBody,
): Promise<ConvertTracesToTestsResult> {
  const body: Record<string, unknown> = selectAll
    ? { ...selectAllBody(selectAll), type }
    : { trace_ids: traceIds, type };
  if (evaluatorUuids && evaluatorUuids.length) {
    body.evaluators = evaluatorUuids;
  }
  if (type === "tool_call") body.accept_any_arguments = !!acceptAnyArguments;
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
  const text = error instanceof Error ? error.message : "";
  const start = text.indexOf("{");
  if (start < 0) return null;
  let detail: unknown;
  try {
    detail = (JSON.parse(text.slice(start)) as { detail?: unknown }).detail;
  } catch {
    return null;
  }
  if (typeof detail === "string") return detail;
  if (!detail || typeof detail !== "object") return null;
  const { error: summary, evaluators, trace_ids: traceIds } = detail as {
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
