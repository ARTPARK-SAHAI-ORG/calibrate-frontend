import { agentToolCalls } from "./item-panes/shared";

// An empty list is kept as `[]`, since on re-upload it still marks a
// tool-call row.
export function toolCallsCell(calls: unknown): string {
  return Array.isArray(calls) ? JSON.stringify(calls) : "";
}

export function actualToolCallsCell(p: Record<string, unknown>): string {
  const calls = agentToolCalls(p);
  return Array.isArray(p.actual_tool_calls) || calls.length > 0
    ? JSON.stringify(calls)
    : "";
}
