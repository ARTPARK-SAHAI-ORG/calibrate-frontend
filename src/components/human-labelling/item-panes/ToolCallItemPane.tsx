import {
  TestDetailView,
  type TestCaseHistory,
  type TestCaseOutput,
} from "@/components/test-results/shared";

/**
 * Renders the conversation side of a tool-call labelling item (a tool-call
 * item inside an `llm` task): the conversation and the agent's actual output
 * (its tool call, or the text it replied with when it made no call). This is
 * the "what happened" pane — the "what was expected" spec is the item's
 * evaluator-equivalent and renders on the other side of the screen, in
 * `ExpectedToolCallsPanel`, the same place a response item's evaluators show.
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
    ? (payload.actual_tool_calls as NonNullable<TestCaseOutput["tool_calls"]>)
    : [];
  // A failed tool-call test: the agent replied with text instead of calling a
  // tool. Show that reply so the annotator sees what the agent actually did.
  const agentResponse =
    typeof payload.agent_response === "string" ? payload.agent_response : "";

  const output: TestCaseOutput | undefined =
    actualToolCalls.length > 0 || agentResponse
      ? {
          ...(actualToolCalls.length > 0 ? { tool_calls: actualToolCalls } : {}),
          ...(agentResponse ? { response: agentResponse } : {}),
        }
      : undefined;

  const hasAnything = history.length > 0 || !!output;
  if (!hasAnything) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return <TestDetailView history={history} output={output} passed={true} />;
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
