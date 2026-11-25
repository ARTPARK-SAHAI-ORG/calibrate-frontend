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
        content:
          typeof output === "string" ? output : JSON.stringify(output, null, 2),
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

/** The stored fields for the dialog's history. For an llm item a trailing
 * plain assistant reply becomes `agent_response`. Trailing tool-call turns
 * (with their responses) after the last text become `actual_tool_calls`,
 * with an empty `agent_response`. */
export function historyToPayloadFields(
  history: HistoryItem[],
  taskType: string | undefined,
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
  const last = history[history.length - 1];
  if (
    last &&
    last.role === "assistant" &&
    !isCall(last) &&
    typeof last.content === "string"
  ) {
    return {
      chat_history: history.slice(0, -1),
      agent_response: writeTextField(last.content, {
        label: last.label,
        versions: last.versions,
      }),
      actual_tool_calls: undefined,
    };
  }
  let start = history.length;
  while (
    start > 0 &&
    (isCall(history[start - 1]) || history[start - 1].role === "tool")
  ) {
    start -= 1;
  }
  const trailing = history.slice(start);
  if (!trailing.some(isCall)) {
    return {
      chat_history: history,
      agent_response: "",
      actual_tool_calls: undefined,
    };
  }
  const actual_tool_calls = trailing.filter(isCall).flatMap((turn) =>
    (turn.tool_calls ?? []).map((call) => {
      const { args } = normalizeToolCall(call);
      const response = trailing.find(
        (t) => t.role === "tool" && t.tool_call_id === call.id,
      );
      return {
        tool: call.function.name,
        arguments: args,
        ...(typeof response?.content === "string"
          ? { output: parseToolOutput(response.content) }
          : {}),
      };
    }),
  );
  return {
    chat_history: history.slice(0, start),
    agent_response: "",
    actual_tool_calls,
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
