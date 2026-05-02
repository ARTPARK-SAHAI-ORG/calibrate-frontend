import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";

export function SimulationItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  // Reuse the same read-only conversation renderer used by the test
  // runner / benchmark dialogs (and the LLM labelling pane), so all
  // surfaces displaying a conversation look the same.
  const history: TestCaseHistory[] = [];
  if (Array.isArray(payload.transcript)) {
    for (const m of payload.transcript) {
      const norm = normaliseHistoryItem(m);
      if (norm) history.push(norm);
    }
  }

  if (history.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return <TestDetailView history={history} passed={true} />;
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
