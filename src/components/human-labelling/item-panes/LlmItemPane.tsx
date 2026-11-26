import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";
import { readTextField } from "@/lib/messageVersions";
import { normaliseHistoryItem } from "./shared";

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

  const agentResponse = readTextField(payload.agent_response);
  if (agentResponse && agentResponse.content.length > 0) {
    history.push({ role: "assistant", ...agentResponse });
  }

  if (history.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4">
        <p className="text-sm text-muted-foreground">—</p>
      </div>
    );
  }

  return (
    <TestDetailView
      history={history}
      passed={true}
      highlightEvalTarget
    />
  );
}
