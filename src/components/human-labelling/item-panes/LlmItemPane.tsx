import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";

export function LlmItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  // Reuse the read-only conversation renderer from the test runner /
  // benchmark dialogs so labelling stays visually in sync with how the
  // same conversation is displayed elsewhere in the product.
  const history: TestCaseHistory[] = [];
  if (Array.isArray(payload.chat_history)) {
    for (const m of payload.chat_history) {
      const norm = normaliseHistoryItem(m);
      if (norm) history.push(norm);
    }
  }

  const agentResponse =
    typeof payload.agent_response === "string"
      ? (payload.agent_response as string)
      : "";
  if (agentResponse.length > 0) {
    history.push({ role: "assistant", content: agentResponse });
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
  if (role === "assistant") {
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      return {
        role: "assistant",
        ...(content != null ? { content } : {}),
        tool_calls: toolCalls as TestCaseHistory["tool_calls"],
      };
    }
    if (content != null) return { role: "assistant", content };
    return null;
  }
  if (role === "user" && content != null) {
    return { role: "user", content };
  }
  if (role === "tool" && content != null) {
    return {
      role: "tool",
      content,
      ...(toolCallId ? { tool_call_id: toolCallId } : {}),
    };
  }
  return null;
}
