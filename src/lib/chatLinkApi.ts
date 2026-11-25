import { apiGet } from "@/lib/api";

/** An agent's chat page link, and today's messages against its daily limit. */
export type ChatLink = {
  is_public: boolean;
  share_token: string | null;
  connection_verified: boolean;
  /** Messages the agent replied to on its chat page today (UTC). */
  messages_today: number;
  /** The agent's own limit: its number, else the workspace default. */
  daily_message_limit: number;
};

export function fetchChatLink(
  accessToken: string,
  agentUuid: string,
): Promise<ChatLink> {
  return apiGet<ChatLink>(
    `/agents/${encodeURIComponent(agentUuid)}/chat-link`,
    accessToken,
  );
}
