import {
  TestDetailView,
  type TestCaseHistory,
} from "@/components/test-results/shared";
import { readTextField } from "@/lib/messageVersions";
import { ExpectedToolCalls } from "./ExpectedToolCalls";
import { agentToolCalls, normaliseHistoryItem } from "./shared";

/**
 * Renders the conversation side of a tool-call labelling item: the
 * conversation, then what the agent did (its reply if it wrote one, then its
 * tool calls), as the judge reads them. The expected calls render under it in
 * `ExpectedToolCalls`, so the two can be compared.
 *
 * The agent's output is appended to `history` and highlighted with
 * `highlightEvalTarget` rather than passed as `TestDetailView`'s `output`,
 * which would draw pass/fail marks on an item nobody has judged yet.
 */
const AGENT_ANSWER = "Agent's answer";

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
    history.push({ role: "assistant", tool_calls: actualToolCalls });
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
      highlightEvalTarget
      toolCallLabel={hasReply ? "Agent's tool calls" : AGENT_ANSWER}
      afterHistory={
        <>
          {hasReply && hasCalls && (
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              The evaluator reads the agent&apos;s reply and its tool calls
              together
            </div>
          )}
          <ExpectedToolCalls payload={payload} />
        </>
      }
    />
  );
}
