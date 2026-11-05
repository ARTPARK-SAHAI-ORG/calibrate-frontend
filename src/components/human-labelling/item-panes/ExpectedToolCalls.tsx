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
    <div className="space-y-1 border-l-2 border-green-500 pl-4 -ml-4">
      <h3 className="text-sm font-medium text-foreground">Expected answer</h3>
      <div className="w-[88%] md:w-3/4 space-y-2">
        {expected.map((tc, i) => {
          const { toolName, args } = normalizeToolCall(tc);
          return (
            <ToolCallCard
              key={i}
              toolName={toolName}
              args={args}
              expected
              alwaysOpen
            />
          );
        })}
      </div>
    </div>
  );
}
