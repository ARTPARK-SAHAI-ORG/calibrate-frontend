import type { TestConfig } from "@/components/AddTestDialog";
import {
  readTextField,
  writeTextField,
  type TextField,
  type TurnExtras,
} from "@/lib/messageVersions";
import { normaliseHistoryItem } from "./item-panes/shared";

export type HistoryItem = NonNullable<TestConfig["history"]>[number];

function parseHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normaliseHistoryItem)
    .filter((turn) => turn !== null) as HistoryItem[];
}

/** The dialog's history for a stored item: the transcript for a
 * conversation item; for an llm item the chat history plus the graded reply
 * as a trailing assistant turn. */
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
  return history;
}

/** The stored fields for the dialog's history. For an llm item the trailing
 * plain assistant reply becomes `agent_response`; a tool-call turn is not a
 * graded reply and stays in `chat_history`. */
export function historyToPayloadFields(
  history: HistoryItem[],
  taskType: string | undefined,
):
  | { transcript: HistoryItem[] }
  | { chat_history: HistoryItem[]; agent_response: string | TextField } {
  if (taskType === "conversation") return { transcript: history };
  const last = history[history.length - 1];
  if (
    last &&
    last.role === "assistant" &&
    !(Array.isArray(last.tool_calls) && last.tool_calls.length > 0) &&
    typeof last.content === "string"
  ) {
    return {
      chat_history: history.slice(0, -1),
      agent_response: writeTextField(last.content, {
        label: last.label,
        versions: last.versions,
      }),
    };
  }
  return { chat_history: history, agent_response: "" };
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
