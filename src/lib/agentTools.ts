import { getDefaultHeaders } from "@/lib/api";

/**
 * Attach tools to an agent.
 *
 * Used when a tool is written from a screen that is already about one agent:
 * the agent's own Tools tab, and the tool-call tests on its Tests tab. A tool
 * written there is meant for that agent, so it goes on straight away rather
 * than leaving the reader to attach it by hand afterwards.
 */
export async function attachToolsToAgent(
  agentUuid: string,
  toolUuids: string[],
  accessToken: string | undefined,
): Promise<void> {
  if (toolUuids.length === 0) return;
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) throw new Error("BACKEND_URL is not set");
  const response = await fetch(`${backendUrl}/agent-tools`, {
    method: "POST",
    headers: {
      ...getDefaultHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ agent_uuid: agentUuid, tool_uuids: toolUuids }),
  });
  if (!response.ok) throw new Error("Failed to add tools to agent");
}
