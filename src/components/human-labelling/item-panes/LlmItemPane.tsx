import {
  TestDetailView,
  outputToolCallsToHistory,
  type TestCaseHistory,
  type ToolCallOutput,
} from "@/components/test-results/shared";
import { normaliseHistoryItem } from "./shared";

export function LlmItemPane({ payload }: { payload: Record<string, unknown> }) {
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

  // A tool-call test's saved item carries the calls the agent made. Append
  // them as the trailing assistant turn(s), the same way the labelling dialog
  // does, so the annotator sees the call instead of an empty reply.
  if (
    Array.isArray(payload.actual_tool_calls) &&
    payload.actual_tool_calls.length > 0
  ) {
    history.push(
      ...outputToolCallsToHistory(
        payload.actual_tool_calls as ToolCallOutput[],
      ),
    );
  }

  if (history.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return <TestDetailView history={history} passed={true} highlightEvalTarget />;
}
