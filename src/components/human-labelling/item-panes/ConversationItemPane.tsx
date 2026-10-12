import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";
import { normaliseHistoryItem } from "./shared";

export function ConversationItemPane({
  payload,
  showVersions = true,
}: {
  payload: Record<string, unknown>;
  showVersions?: boolean;
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

  return (
    <TestDetailView
      history={history}
      passed={true}
      showVersions={showVersions}
    />
  );
}
