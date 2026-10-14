import {
  ToolCallCard,
  TurnVersionBubbles,
  normalizeToolCall,
} from "@/components/test-results/shared";
import { readTextField } from "@/lib/messageVersions";
import { Section } from "./shared";

/**
 * Renders a general (non-conversational) "llm-general" evaluation item.
 *
 * The backend payload shape for this task type is
 * `{ name, input, output, actual_tool_calls? }` (plus an optional
 * `evaluator_variables` map for per-item `{{variable}}` substitution, which
 * isn't shown here — it feeds the evaluator prompt, not the displayed item).
 * `input` and `output` are a string or `{ content, label?, versions? }`.
 * A tool-call test usually has an empty `output` and the calls the agent made
 * in `actual_tool_calls`, drawn the same way the run results screen draws
 * them. We fall back to a raw JSON dump only when there is none of the three.
 */
export function LlmGeneralItemPane({
  payload,
  showVersions = true,
}: {
  payload: Record<string, unknown>;
  showVersions?: boolean;
}) {
  const inputField = readTextField(payload.input);
  const outputField = readTextField(payload.output);
  const input = inputField?.content ?? "";
  const output = outputField?.content ?? "";
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
      <Section title="Input" subtitle={inputField?.label}>
        <p className="text-sm whitespace-pre-wrap break-words">
          {input || "—"}
        </p>
        {showVersions && (
          <TurnVersionBubbles
            versions={inputField?.versions}
            side="assistant"
          />
        )}
      </Section>
      <Section title="Output" subtitle={outputField?.label}>
        {output && (
          <p className="text-sm whitespace-pre-wrap break-words">{output}</p>
        )}
        {showVersions && (
          <TurnVersionBubbles
            versions={outputField?.versions}
            side="assistant"
          />
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
