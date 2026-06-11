import { Section } from "./shared";

// Common payload keys the backend may use for the model's output on a
// non-conversational ("llm-general") evaluation item. We render the first
// one present as the "Output" section.
const OUTPUT_KEYS = ["output", "response", "completion", "agent_response"];
// Keys that are metadata rather than evaluation inputs — never shown as a
// variable/input row.
const META_KEYS = new Set(["name", ...OUTPUT_KEYS]);

function asDisplayString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function humanise(key: string): string {
  const spaced = key.replace(/[_-]+/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/**
 * Renders a general (non-conversational) LLM evaluation item: the prompt
 * inputs / variables on the one hand and the model output on the other.
 * The backend payload shape isn't fixed (it mirrors whatever variables the
 * evaluator's prompt declares), so we display every scalar field generically
 * and fall back to a raw JSON dump when nothing is renderable.
 */
export function LlmGeneralItemPane({
  payload,
}: {
  payload: Record<string, unknown>;
}) {
  const name = typeof payload.name === "string" ? payload.name : "";

  const outputKey = OUTPUT_KEYS.find(
    (k) => typeof payload[k] === "string" && (payload[k] as string).length > 0,
  );
  const output = outputKey ? (payload[outputKey] as string) : "";

  const inputRows = Object.entries(payload)
    .filter(([key]) => !META_KEYS.has(key))
    .map(([key, value]) => [key, asDisplayString(value)] as const)
    .filter((entry): entry is readonly [string, string] => entry[1] !== null);

  const hasContent = output.length > 0 || inputRows.length > 0;

  if (!hasContent) {
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
    <div className="space-y-4">
      {name && <p className="text-sm font-semibold text-foreground">{name}</p>}
      {inputRows.length > 0 && (
        <Section title="Input" subtitle="What the LLM was given">
          <div className="space-y-3">
            {inputRows.map(([key, value]) => (
              <div key={key} className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {humanise(key)}
                </p>
                <p className="text-sm whitespace-pre-wrap break-words">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </Section>
      )}
      <Section title="Output" subtitle="What the LLM produced">
        <p className="text-sm whitespace-pre-wrap break-words">
          {output || "—"}
        </p>
      </Section>
    </div>
  );
}
