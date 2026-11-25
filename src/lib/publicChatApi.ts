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
  trace_uuid: string;
  reply: string | null;
  tool_calls: ChatToolCall[];
  ended: boolean;
};

export type ChatRating = "up" | "down";

export type ChatFeedback = { rating: ChatRating | null; comment: string | null };

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
  init?: { method?: string; body?: unknown },
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

export function fetchChatAgent(token: string) {
  return call<ChatAgent>(base(token));
}

export function sendChatMessage(
  token: string,
  body: { conversation_id: string | null; message: string },
) {
  return call<ChatReply>(`${base(token)}/messages`, { method: "POST", body });
}

export function setChatFeedback(
  token: string,
  traceUuid: string,
  body: ChatFeedback,
) {
  return call<ChatFeedback>(
    `${base(token)}/traces/${encodeURIComponent(traceUuid)}/feedback`,
    { method: "PUT", body },
  );
}
