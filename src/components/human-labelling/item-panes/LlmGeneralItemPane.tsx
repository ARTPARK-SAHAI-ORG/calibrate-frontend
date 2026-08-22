import {
  ToolCallCard,
  normalizeToolCall,
} from "@/components/test-results/shared";
import { Section } from "./shared";

/**
 * Renders a general (non-conversational) "llm-general" evaluation item.
 *
 * The backend payload shape for this task type is
 * `{ name, input, output, actual_tool_calls? }` (plus an optional
 * `evaluator_variables` map for per-item `{{variable}}` substitution, which
 * isn't shown here — it feeds the evaluator prompt, not the displayed item).
 * A tool-call test usually has an empty `output` and the calls the agent made
 * in `actual_tool_calls`, drawn the same way the run results screen draws
 * them. We fall back to a raw JSON dump only when there is none of the three.
 */
export function LlmGeneralItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const input = typeof payload.input === "string" ? payload.input : "";
  const output = typeof payload.output === "string" ? payload.output : "";
  const toolCalls = Array.isArray(payload.actual_tool_calls)
    ? payload.actual_tool_calls
    : [];

  if (!input && !output && toolCalls.length === 0) {
    return (
      <div className="space-y-2">
        <Section title="Item payload">
          <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
            {JSON.stringify(payload, null, 2)}
          </pre>
        </Section>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Section title="Input">
        <p className="text-sm whitespace-pre-wrap break-words">
          {input || "—"}
        </p>
      </Section>
      <Section title="Output">
        {output && (
          <p className="text-sm whitespace-pre-wrap break-words">{output}</p>
        )}
        {toolCalls.length > 0 && (
          <div className={`space-y-3 ${output ? "mt-3" : ""}`}>
            {toolCalls.map((toolCall, index) => {
              const {
                toolName,
                args,
                output: toolOutput,
              } = normalizeToolCall(toolCall);
              return (
                <ToolCallCard
                  key={index}
                  toolName={toolName}
                  args={args}
                  output={toolOutput}
                />
              );
            })}
          </div>
        )}
        {!output && toolCalls.length === 0 && (
          <p className="text-sm text-muted-foreground">—</p>
        )}
      </Section>
    </div>
  );
}
