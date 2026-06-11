import { Section } from "./shared";

/**
 * Renders a general (non-conversational) "llm-general" evaluation item.
 *
 * The backend payload shape for this task type is `{ name, input, output }`
 * (plus an optional `evaluator_variables` map for per-item `{{variable}}`
 * substitution, which isn't shown here — it feeds the evaluator prompt, not
 * the displayed item). We read `input`/`output` explicitly and fall back to a
 * raw JSON dump if neither is present.
 */
export function LlmGeneralItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const input = typeof payload.input === "string" ? payload.input : "";
  const output = typeof payload.output === "string" ? payload.output : "";

  if (!input && !output) {
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
      <Section title="Input" subtitle="What the LLM was given">
        <p className="text-sm whitespace-pre-wrap break-words">
          {input || "—"}
        </p>
      </Section>
      <Section title="Output" subtitle="What the LLM produced">
        <p className="text-sm whitespace-pre-wrap break-words">
          {output || "—"}
        </p>
      </Section>
    </div>
  );
}
