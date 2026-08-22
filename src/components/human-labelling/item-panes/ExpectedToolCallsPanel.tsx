import {
  ToolCallCard,
  normalizeToolCall,
} from "@/components/test-results/shared";

/**
 * The expected tool-call spec for a tool-call labelling item — what an
 * evaluator card is for a response item. Shown on the right, next to the
 * conversation, wherever a response item would show its evaluators:
 * `EvaluatorsPane` (the annotator's working view) and `EvaluatorResultsPane`
 * (the read-only item detail view). Both share this component so the layout
 * can't drift between them.
 */
export function ExpectedToolCallsPanel({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const expectedToolCalls = Array.isArray(payload.expected_tool_calls)
    ? (payload.expected_tool_calls as unknown[])
    : [];
  return (
    <div className="space-y-2">
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
  );
}
