import {
  ToolCallCard,
  normalizeToolCall,
} from "@/components/test-results/shared";

/**
 * The tool calls a tool-call test expected, drawn the way the run results
 * screen draws them. An item made from a tool-call test carries them at
 * `payload.expected_tool_calls`; every other item has none, so this renders
 * nothing at all rather than an empty heading.
 */
export function ExpectedToolCalls({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const expected = payload.expected_tool_calls;
  if (!Array.isArray(expected) || expected.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-foreground">
        Expected tool calls
      </h3>
      <div className="space-y-2">
        {expected.map((tc, i) => {
          const { toolName, args } = normalizeToolCall(tc);
          return (
            <ToolCallCard key={i} toolName={toolName} args={args} expected />
          );
        })}
      </div>
    </div>
  );
}
