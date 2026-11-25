import { publicFetch } from "@/lib/publicFetch";

/** The public chat link routes (`/public/agent-chat/{token}`). */

export type ChatAgent = {
  agent_name: string;
  interaction_type: "conversation" | "general";
};

export type ChatToolCall = {
  tool: string;
  arguments: Record<string, unknown>;
  output: unknown;
};

export type ChatReply = {
  conversation_id: string;
  /** null when the workspace has no room left to keep the reply. */
  trace_uuid: string | null;
  reply: string | null;
  tool_calls: ChatToolCall[];
  ended: boolean;
};

/** true for a thumbs up, false for a thumbs down, null for none. */
export type ChatFeedback = { is_correct: boolean | null; comment: string | null };

/** `error` is the backend's code (`not_found`, `daily_limit`, ...), or
 *  `unknown` when the failure carried none, `network` when nothing answered. */
export type ChatResult<T> = { ok: true; data: T } | { ok: false; error: string };

function errorCode(status: number, text: string): string {
  try {
    const body = JSON.parse(text);
    const code = body?.detail?.error ?? body?.error;
    if (typeof code === "string") return code;
  } catch {
    // not JSON
  }
  return status === 404 ? "not_found" : "unknown";
}

async function call<T>(
  path: string,
  init: { method?: string; body?: unknown; accessToken?: string | null },
): Promise<ChatResult<T>> {
  try {
    const res = await publicFetch<T>(path, init);
    return res.ok
      ? res
      : { ok: false, error: errorCode(res.status, res.text) };
  } catch {
    return { ok: false, error: "network" };
  }
}

const base = (token: string) =>
  `/public/agent-chat/${encodeURIComponent(token)}`;

/** `accessToken` is the reader's own login, when they have one: it lets a
 *  member of the agent's workspace open the chat while it is private. */
export function fetchChatAgent(token: string, accessToken?: string | null) {
  return call<ChatAgent>(base(token), { accessToken });
}

/** One earlier turn of the conversation, sent back with each new message so
 *  the agent keeps the conversation even when its replies were not stored. */
export type ChatHistoryTurn =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string | null; tool_calls: ChatToolCall[] };

export function sendChatMessage(
  token: string,
  body: {
    conversation_id: string | null;
    message: string;
    history: ChatHistoryTurn[];
  },
  accessToken?: string | null,
) {
  return call<ChatReply>(`${base(token)}/messages`, {
    method: "POST",
    body,
    accessToken,
  });
}

export function setChatFeedback(
  token: string,
  traceUuid: string,
  body: ChatFeedback,
  accessToken?: string | null,
) {
  return call<ChatFeedback>(
    `${base(token)}/traces/${encodeURIComponent(traceUuid)}/feedback`,
    { method: "PUT", body, accessToken },
  );
}
