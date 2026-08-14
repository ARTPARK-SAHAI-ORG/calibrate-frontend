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
  input: TraceTurn[];
  output: TraceOutput;
  metadata: TraceMetadataEntry[] | null;
  created_at: string;
  updated_at: string;
};

/** The backend caps a page at 200 rows. */
export const MAX_TRACES_PAGE_SIZE = 200;

export type TraceListParams = {
  limit: number;
  offset: number;
  /** Traces belong to one agent; every read is scoped to it. */
  agentId: string;
};

/**
 * Fetch one page of traces for one agent. Unlike the other list pages this one
 * pages on the server: the trace store can hold far more rows than the client
 * should ever download. There is no search — the backend takes no query term —
 * and it refuses a page larger than `MAX_TRACES_PAGE_SIZE`.
 */
export async function fetchTraces(
  accessToken: string,
  { limit, offset, agentId }: TraceListParams,
): Promise<Paginated<TraceSummary>> {
  const params = new URLSearchParams();
  params.set("limit", String(Math.min(limit, MAX_TRACES_PAGE_SIZE)));
  params.set("offset", String(offset));
  params.set("agent_id", agentId);
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

export type ConvertTestType = "response" | "tool_call";

export type ConvertTracesToTestsBody = {
  traceIds: string[];
  type: ConvertTestType;
  /** Evaluators to link to each created test. Required (and used) for `response`. */
  evaluatorUuids?: string[];
  /** Agents to link every created test to, so they're runnable immediately. */
  agentUuids?: string[];
  /** For `tool_call`: match only the tool name, ignore the recorded arguments. */
  acceptAnyArguments?: boolean;
};

export type ConvertTracesToTestsResult = {
  /** The tests that were created. Count them for a "created N tests" message:
   *  the backend does not send a count of its own. */
  test_uuids: string[];
};

/**
 * Convert selected traces into regression tests. `response` tests re-run the
 * agent and judge the reply (needs ≥1 evaluator); `tool_call` tests assert the
 * recorded tool calls. Backed by `POST /traces/convert-to-tests`.
 */
export async function convertTracesToTests(
  accessToken: string,
  {
    traceIds,
    type,
    evaluatorUuids,
    agentUuids,
    acceptAnyArguments,
  }: ConvertTracesToTestsBody,
): Promise<ConvertTracesToTestsResult> {
  const body: Record<string, unknown> = { trace_ids: traceIds, type };
  if (evaluatorUuids && evaluatorUuids.length) {
    body.evaluators = evaluatorUuids.map((uuid) => ({ evaluator_uuid: uuid }));
  }
  if (agentUuids && agentUuids.length) body.agent_uuids = agentUuids;
  if (type === "tool_call") body.accept_any_arguments = !!acceptAnyArguments;
  return apiPost<ConvertTracesToTestsResult>(
    "/traces/convert-to-tests",
    accessToken,
    body,
  );
}
