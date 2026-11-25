import type { TestConfig } from "@/components/AddTestDialog";
import {
  readTextField,
  writeTextField,
  type TextField,
  type TurnExtras,
} from "@/lib/messageVersions";
import { normaliseHistoryItem } from "./item-panes/shared";
import { normalizeToolCall } from "@/components/test-results/shared";

export type HistoryItem = NonNullable<TestConfig["history"]>[number];

function parseHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normaliseHistoryItem)
    .filter((turn) => turn !== null) as HistoryItem[];
}

export type ToolCallRecord = {
  tool: string;
  arguments: Record<string, unknown>;
  output?: unknown;
};

/** The dialog's history for a stored item: the transcript for a
 * conversation item; for an llm item the chat history, then the graded reply
 * as a trailing assistant turn, then any `actual_tool_calls` as trailing
 * tool-call turns each followed by its response. */
export function payloadToHistory(
  payload: Record<string, unknown>,
  taskType: string | undefined,
): HistoryItem[] {
  if (taskType === "conversation") return parseHistory(payload.transcript);
  const history = parseHistory(payload.chat_history);
  const reply = readTextField(payload.agent_response);
  if (reply && reply.content.length > 0) {
    const { content, ...extras } = reply;
    history.push({ role: "assistant", content, ...extras });
  }
  const calls = Array.isArray(payload.actual_tool_calls)
    ? payload.actual_tool_calls
    : [];
  calls.forEach((raw, i) => {
    const { toolName, args, output } = normalizeToolCall(raw);
    const id = `actual-call-${i}`;
    history.push({
      role: "assistant",
      tool_calls: [
        {
          id,
          type: "function",
          function: { name: toolName, arguments: JSON.stringify(args) },
        },
      ],
    });
    if (output !== undefined) {
      history.push({
        role: "tool",
        content: outputText(output),
        tool_call_id: id,
      });
    }
  });
  return history;
}

function parseToolOutput(content: string): unknown {
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
}

function outputText(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

// The responses the item dialog fills in for a tool call that has none.
export const DEFAULT_WEBHOOK_RESPONSE =
  '{\n  "status": "success",\n  "response": {}\n}';
export const DEFAULT_STRUCTURED_RESPONSE = '{\n  "status": "received"\n}';

// How the item dialog shows a saved argument value in its text box.
function argumentText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** The dialog edits argument values as text, so a value it shows unchanged is
 * put back as the original value. Returns `previous` itself when nothing was
 * changed, which also keeps keys the dialog does not show. */
function restoreArguments(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  text: (value: unknown) => string = argumentText,
): Record<string, unknown> {
  let changed = Object.keys(next).some((k) => !(k in previous));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(next)) {
    const before = previous[k];
    if (v === before) {
      out[k] = before;
    } else if (isPlainObject(v) && isPlainObject(before)) {
      out[k] = restoreArguments(v, before, text);
      if (out[k] !== before) changed = true;
    } else if (typeof v === "string" && v === text(before)) {
      out[k] = before;
    } else {
      out[k] = v;
      changed = true;
    }
  }
  return changed ? out : previous;
}

/** Tool calls back from a dialog that edits argument values as text: each
 * call that still names the same tool as the stored call in its place gets
 * the stored values back where its text is unchanged. `text` is how that
 * dialog writes a value into its box. */
export function restoreToolCalls<
  T extends { tool: string; arguments: Record<string, unknown> },
>(next: T[], previous: unknown, text?: (value: unknown) => string): T[] {
  const before = Array.isArray(previous) ? previous : [];
  return next.map((call, i) => {
    if (before[i] === undefined) return call;
    const prior = normalizeToolCall(before[i]);
    if (prior.toolName !== call.tool) return call;
    return {
      ...call,
      arguments: restoreArguments(call.arguments, prior.args, text),
    };
  });
}

/** A list field on save: the new list when it has entries. An empty list is
 * kept only when the item already stored an empty one, since an empty list
 * still marks a tool-call item. A list emptied by the reader is removed. */
export function keepList<T>(previous: unknown, next: T[]): T[] | undefined {
  if (next.length > 0) return next;
  return Array.isArray(previous) && previous.length === 0 ? [] : undefined;
}

/** The stored fields for the dialog's history. For an llm item, trailing
 * tool-call turns (with their responses) become `actual_tool_calls`, and an
 * agent text reply at the end, or just before those turns, becomes
 * `agent_response`. `previous` is the item being edited: values the dialog
 * shows unchanged are saved exactly as they were. */
export function historyToPayloadFields(
  history: HistoryItem[],
  taskType: string | undefined,
  previous?: Record<string, unknown>,
):
  | { transcript: HistoryItem[] }
  | {
      chat_history: HistoryItem[];
      agent_response: string | TextField;
      actual_tool_calls?: ToolCallRecord[];
    } {
  if (taskType === "conversation") return { transcript: history };
  const isCall = (h: HistoryItem) =>
    h.role === "assistant" &&
    Array.isArray(h.tool_calls) &&
    h.tool_calls.length > 0;
  const isReply = (h: HistoryItem | undefined) =>
    !!h &&
    h.role === "assistant" &&
    !isCall(h) &&
    typeof h.content === "string";
  let start = history.length;
  while (
    start > 0 &&
    (isCall(history[start - 1]) || history[start - 1].role === "tool")
  ) {
    start -= 1;
  }
  const trailing = history.slice(start);
  const hasCalls = trailing.some(isCall);
  const replyIndex = hasCalls
    ? isReply(history[start - 1])
      ? start - 1
      : -1
    : isReply(history[history.length - 1])
      ? history.length - 1
      : -1;
  const reply = replyIndex >= 0 ? history[replyIndex] : undefined;
  const chat_history = history.slice(
    0,
    replyIndex >= 0 ? replyIndex : hasCalls ? start : history.length,
  );
  const agent_response = reply
    ? writeTextField(reply.content as string, {
        label: reply.label,
        versions: reply.versions,
      })
    : "";
  const before = Array.isArray(previous?.actual_tool_calls)
    ? (previous.actual_tool_calls as unknown[])
    : [];
  const calls: ToolCallRecord[] = hasCalls
    ? restoreToolCalls(
        trailing
          .filter(isCall)
          .flatMap((turn) =>
            (turn.tool_calls ?? []).map((call) => {
              const { args } = normalizeToolCall(call);
              const response = trailing.find(
                (t) => t.role === "tool" && t.tool_call_id === call.id,
              );
              return {
                tool: call.function.name,
                arguments: args as Record<string, unknown>,
                content:
                  typeof response?.content === "string"
                    ? response.content
                    : undefined,
              };
            }),
          )
          .map(({ tool, arguments: args, content }, i) => {
            const prior =
              before[i] === undefined
                ? undefined
                : normalizeToolCall(before[i]);
            const same = prior?.toolName === tool;
            const priorOutput = same ? prior?.output : undefined;
            let output: unknown;
            if (content !== undefined) {
              if (
                priorOutput !== undefined &&
                content === outputText(priorOutput)
              ) {
                output = priorOutput;
              } else if (!(
                same &&
                priorOutput === undefined &&
                (content === DEFAULT_STRUCTURED_RESPONSE ||
                  content === DEFAULT_WEBHOOK_RESPONSE)
              )) {
                output = parseToolOutput(content);
              }
            }
            return {
              tool,
              arguments: args,
              ...(output !== undefined ? { output } : {}),
            };
          }),
        previous?.actual_tool_calls,
      )
    : [];
  return {
    chat_history,
    agent_response,
    actual_tool_calls: keepList(previous?.actual_tool_calls, calls),
  };
}

/** The dialog's input and output back as payload fields. */
export function textFieldsToPayload(fields: {
  input: string;
  output: string;
  inputExtras?: TurnExtras;
  outputExtras?: TurnExtras;
}) {
  return {
    input: writeTextField(fields.input, fields.inputExtras),
    output: writeTextField(fields.output, fields.outputExtras),
  };
}
