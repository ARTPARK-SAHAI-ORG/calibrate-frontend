import { apiGet, apiPost, Paginated } from "./api";

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
  message_id: string;
  conversation_id: string;
  input_preview: string | null;
  response_preview: string | null;
  turn_count: number;
  tool_call_count: number;
  metadata_count: number;
  created_at: string;
};

export type TraceDetail = {
  uuid: string;
  message_id: string;
  conversation_id: string;
  input: TraceTurn[];
  output: TraceOutput;
  metadata: TraceMetadataEntry[] | null;
  created_at: string;
  updated_at: string;
};

export type TraceListParams = {
  limit: number;
  offset: number;
  q?: string;
  conversationId?: string;
};

/**
 * Fetch one page of traces. Unlike the other list pages, filtering and search
 * run server-side (the trace store can hold far more rows than the client
 * should ever download), so `q`/`conversation_id` go out as query params
 * instead of being applied over a fully-fetched list.
 */
export async function fetchTraces(
  accessToken: string,
  { limit, offset, q, conversationId }: TraceListParams,
): Promise<Paginated<TraceSummary>> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  params.set("offset", String(offset));
  if (q && q.trim()) params.set("q", q.trim());
  if (conversationId) params.set("conversation_id", conversationId);
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

export type BulkDeleteTracesResult = {
  deleted: number;
};

/**
 * Soft-delete every trace matching the given filters via the backend's
 * `select_all` contract — the recovery path when a misbehaving client floods
 * the store and the matching set spans more pages than are loaded. Explicit
 * per-row deletion goes through `useTraceDeletion` instead.
 */
export async function bulkDeleteMatchingTraces(
  accessToken: string,
  { q, conversationId }: { q?: string; conversationId?: string },
): Promise<BulkDeleteTracesResult> {
  const body: Record<string, unknown> = { select_all: true };
  if (q && q.trim()) body.q = q.trim();
  if (conversationId) body.conversation_id = conversationId;
  return apiPost<BulkDeleteTracesResult>("/traces/bulk-delete", accessToken, body);
}
