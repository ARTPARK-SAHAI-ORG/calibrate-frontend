import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";
import { readTextField } from "@/lib/messageVersions";
import { ExpectedToolCalls } from "./ExpectedToolCalls";
import { agentToolCalls } from "@/lib/labellingItem";
import { normaliseHistoryItem } from "./shared";

// The agent's output is appended to `history`, not passed as `output`, which
// would draw pass/fail marks on an item nobody has judged yet.
const AGENT_ANSWER = "Agent's answer";

export const NO_TOOL_CALL = "The agent made no tool call";

export function JudgedTogetherNote() {
  return (
    <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
      The reply and the tool calls are judged together
    </div>
  );
}

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

  const agentResponse = readTextField(payload.agent_response);
  const hasReply = !!agentResponse && agentResponse.content.length > 0;
  const actualToolCalls = agentToolCalls(payload) as NonNullable<
    TestCaseHistory["tool_calls"]
  >;
  const hasCalls = actualToolCalls.length > 0;
  if (hasReply) {
    history.push({
      role: "assistant",
      ...agentResponse,
      label: agentResponse.label ?? (hasCalls ? "Agent's reply" : AGENT_ANSWER),
    });
  }
  if (hasCalls) {
    history.push({
      role: "assistant",
      tool_calls: actualToolCalls,
      label: hasReply ? "Agent's tool calls" : AGENT_ANSWER,
    });
  }
  if (!hasReply && !hasCalls && history.length > 0) {
    history.push({
      role: "assistant",
      content: NO_TOOL_CALL,
      label: AGENT_ANSWER,
    });
  }

  if (history.length === 0) {
    return (
      <div className="space-y-4">
        <div className="border border-border rounded-xl p-4">
          <p className="text-sm text-muted-foreground">—</p>
        </div>
        <div className="pl-4">
          <ExpectedToolCalls payload={payload} />
        </div>
      </div>
    );
  }

  return (
    <TestDetailView
      history={history}
      passed={true}
      highlightEvalTarget={hasReply && hasCalls ? 2 : true}
      afterHistory={
        <>
          {hasReply && hasCalls && <JudgedTogetherNote />}
          <ExpectedToolCalls payload={payload} />
        </>
      }
    />
  );
}
