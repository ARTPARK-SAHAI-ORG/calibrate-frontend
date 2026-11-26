import { isMetadataSource, METADATA_SOURCE } from "@/lib/traceScoring";
import type { TraceDetail } from "@/lib/tracesApi";

/**
 * The text a trace holds at `source`, or null when it holds none. Mirrors
 * `trace_variable_value` in the backend, which decides what the evaluator gets.
 */
export function traceValue(trace: TraceDetail, source: string): string | null {
  let value: unknown = null;
  if (source === "input") {
    value =
      typeof trace.input === "string"
        ? trace.input
        : trace.input
            .filter((turn) => turn.content)
            .map((turn) => `${turn.role}: ${turn.content}`)
            .join("\n");
  } else if (source === "output.response") {
    value = trace.output?.response;
  } else if (source === "output.tool_calls") {
    const calls = trace.output?.tool_calls;
    value = calls?.length ? JSON.stringify(calls) : null;
  } else if (source === "labels") {
    value = (trace.labels ?? []).join(", ");
  } else if (source === "conversation_id" || source === "message_id") {
    value = trace[source];
  } else if (isMetadataSource(source)) {
    const key = source.slice(METADATA_SOURCE.length);
    value = trace.metadata?.find((entry) => entry.key === key)?.value;
  }
  return typeof value === "string" && value.trim() ? value : null;
}
