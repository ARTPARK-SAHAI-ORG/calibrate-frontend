// An `llm` labelling-task item's output is either a text reply or a tool call.
// AI (LLM) judges only score text replies; a tool-call output has nothing for
// an AI judge to read, so those items are labelled by humans only.
//
// There is no explicit marker on the payload: `agent_response` holds the text
// reply, and when the output was a tool call `agent_response` is empty and the
// call sits as the final assistant `tool_calls` turn in `chat_history`.
export function isToolCallOutputItem(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  const response =
    typeof p.agent_response === "string" ? p.agent_response.trim() : "";
  if (response.length > 0) return false;
  const history = Array.isArray(p.chat_history) ? p.chat_history : [];
  // The output tool call is appended as the final turn(s); find the last
  // assistant turn and check whether it carries tool calls.
  for (let i = history.length - 1; i >= 0; i--) {
    const turn = history[i];
    if (!turn || typeof turn !== "object") continue;
    const t = turn as Record<string, unknown>;
    if (t.role === "assistant") {
      return Array.isArray(t.tool_calls) && t.tool_calls.length > 0;
    }
  }
  return false;
}
