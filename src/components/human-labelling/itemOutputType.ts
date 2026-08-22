// A labelling-task item whose output is a tool call, not a text reply. These
// live inside a normal `llm` / `llm-general` task but are labelled by a human
// with a single correct/wrong verdict — AI judges have nothing to read and are
// skipped.
//
// Two shapes count as a tool-call item:
//  1. A tool-call item built when a tool-call test/trace is submitted for
//     labelling. These always carry BOTH `actual_tool_calls` (what the agent
//     called) and `expected_tool_calls` (the test's match spec). Either array's
//     presence marks the item — the arrays can be empty: a failed tool-call
//     test has no `actual_tool_calls` (the agent produced no call) but still
//     carries the `expected_tool_calls` spec, and a trace carries actual calls
//     with an empty spec. Checking presence, not length, is what makes a failed
//     tool-call test still read as a tool-call item to label.
//  2. A plain `llm` item whose reply was a tool call: `agent_response` is empty
//     and the final assistant turn in `chat_history` carries `tool_calls`.
export function isToolCallOutputItem(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (
    Array.isArray(p.actual_tool_calls) ||
    Array.isArray(p.expected_tool_calls)
  ) {
    return true;
  }
  const response =
    typeof p.agent_response === "string" ? p.agent_response.trim() : "";
  if (response.length > 0) return false;
  const history = Array.isArray(p.chat_history) ? p.chat_history : [];
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
