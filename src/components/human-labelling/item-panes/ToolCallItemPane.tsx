import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";

/**
 * Renders the conversation side of a tool-call labelling item (a tool-call
 * item inside an `llm` task): the conversation and the agent's actual output
 * (its tool call, or the text it replied with when it made no call). This is
 * the "what happened" pane — the "what was expected" spec is the item's
 * evaluator-equivalent and renders on the other side of the screen, in
 * `ExpectedToolCallsPanel`, the same place a response item's evaluators show.
 *
 * Follows the exact same pattern as `LlmItemPane`: the agent's actual output
 * is appended to `history` as its own trailing turn and highlighted with
 * `highlightEvalTarget`, instead of being passed through `TestDetailView`'s
 * separate `output` prop — that prop draws test-run pass/fail chrome (a
 * colored bar, a check or cross) that a labelling item, which nobody has
 * judged yet, should never show.
 */
export function ToolCallItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const history: TestCaseHistory[] = [];
  if (Array.isArray(payload.chat_history)) {
    for (const m of payload.chat_history) {
      const norm = normaliseHistoryItem(m);
      if (norm) history.push(norm);
    }
  }

  const actualToolCalls = Array.isArray(payload.actual_tool_calls)
    ? (payload.actual_tool_calls as TestCaseHistory["tool_calls"])
    : undefined;
  if (actualToolCalls && actualToolCalls.length > 0) {
    history.push({ role: "assistant", tool_calls: actualToolCalls });
  } else {
    // A failed tool-call test: the agent replied with text instead of
    // calling a tool. Show that reply so the annotator sees what the agent
    // actually did.
    const agentResponse =
      typeof payload.agent_response === "string" ? payload.agent_response : "";
    if (agentResponse.length > 0) {
      history.push({ role: "assistant", content: agentResponse });
    }
  }

  if (history.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <TestDetailView history={history} passed={true} highlightEvalTarget />
  );
}

function normaliseHistoryItem(raw: unknown): TestCaseHistory | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const role = obj.role;
  const content = typeof obj.content === "string" ? obj.content : undefined;
  const toolCalls = obj.tool_calls;
  const toolCallId =
    typeof obj.tool_call_id === "string" ? obj.tool_call_id : undefined;
  const createdAt =
    typeof obj.created_at === "string" ? obj.created_at : undefined;
  const tsField = createdAt ? { created_at: createdAt } : {};
  if (role === "assistant") {
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return {
        role: "assistant",
        ...(content != null ? { content } : {}),
        tool_calls: toolCalls as TestCaseHistory["tool_calls"],
        ...tsField,
      };
    }
    if (content != null) return { role: "assistant", content, ...tsField };
    return null;
  }
  if (role === "user" && content != null) {
    return { role: "user", content, ...tsField };
  }
  if (role === "tool" && content != null) {
    return {
      role: "tool",
      content,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
      ...tsField,
    };
  }
  return null;
}
