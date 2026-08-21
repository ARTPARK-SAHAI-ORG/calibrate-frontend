import {
  TestDetailView,
  ToolCallCard,
  normalizeToolCall,
  type TestCaseHistory,
  type TestCaseOutput,
} from "@/components/test-results/shared";

/**
 * Renders an `llm-tool-call` labelling item: the conversation and the agent's
 * actual tool call(s) on top (shared test renderer), then the expected
 * tool-call spec below, so an annotator can judge whether the actual call
 * matched what was expected.
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
  const expectedToolCalls = Array.isArray(payload.expected_tool_calls)
    ? (payload.expected_tool_calls as unknown[])
    : [];

  const output: TestCaseOutput | undefined =
    actualToolCalls.length > 0 ? { tool_calls: actualToolCalls } : undefined;

  const hasAnything =
    history.length > 0 ||
    actualToolCalls.length > 0 ||
    expectedToolCalls.length > 0;
  if (!hasAnything) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {(history.length > 0 || output) && (
        <TestDetailView history={history} output={output} passed={true} />
      )}
      <div className="px-4 md:px-6 space-y-2">
        <h3 className="text-sm font-semibold text-foreground">
          Expected Tool Calls
        </h3>
        {expectedToolCalls.length > 0 ? (
          <div className="space-y-2">
            {expectedToolCalls.map((tc, i) => {
              const { toolName, args } = normalizeToolCall(tc);
              return (
                <ToolCallCard key={i} toolName={toolName} args={args} expected />
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            No expected tool calls specified
          </p>
        )}
      </div>
    </div>
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
