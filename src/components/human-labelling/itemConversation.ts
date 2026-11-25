import type { TestConfig } from "@/components/AddTestDialog";
import {
  readTextField,
  writeTextField,
  type TextField,
  type TurnExtras,
} from "@/lib/messageVersions";
import { agentToolCalls, normaliseHistoryItem } from "./item-panes/shared";
import { normalizeToolCall } from "@/components/test-results/shared";

export type HistoryItem = NonNullable<TestConfig["history"]>[number];

function parseHistory(raw: unknown): HistoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normaliseHistoryItem)
    .filter((turn) => turn !== null) as HistoryItem[];
}

/** The id every tool call taken from `actual_tool_calls` starts with, which
 * tells it apart from a call earlier in the conversation. */
export const ACTUAL_CALL_ID_PREFIX = "actual-call-";

/** Where the agent's own tool calls start: the run of calls with an
 * ACTUAL_CALL_ID_PREFIX id, and their responses, the conversation ends on.
 * -1 when it does not end on one. */
export function actualToolCallsStart<T>(
  turns: T[],
  callId: (turn: T) => string | undefined,
  isResponse: (turn: T) => boolean,
): number {
  const isActual = (t: T) =>
    callId(t)?.startsWith(ACTUAL_CALL_ID_PREFIX) === true;
  let start = turns.length;
  while (
    start > 0 &&
    (isActual(turns[start - 1]) || isResponse(turns[start - 1]))
  ) {
    start -= 1;
  }
  // A response that follows an earlier call belongs with that call.
  while (start < turns.length && isResponse(turns[start])) start += 1;
  return start < turns.length ? start : -1;
}

export type ToolCallRecord = {
  tool: string;
  arguments: Record<string, unknown>;
  output?: unknown;
};

/** The dialog's history for a stored item: the transcript for a
 * conversation item; for an llm item the chat history, then the graded reply
 * as a trailing assistant turn, then the agent's tool calls as trailing
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
  agentToolCalls(payload).forEach((raw, i) => {
    const { toolName, args, output } = normalizeToolCall(raw);
    const id = `${ACTUAL_CALL_ID_PREFIX}${i}`;
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

function outputText(output: unknown): string {
  return typeof output === "string" ? output : JSON.stringify(output, null, 2);
}

// The responses the item dialog fills in for a tool call that has none.
export const DEFAULT_WEBHOOK_RESPONSE =
  '{\n  "status": "success",\n  "response": {}\n}';
export const DEFAULT_STRUCTURED_RESPONSE = '{\n  "status": "received"\n}';

// How the item dialogs show a saved argument value in their one-line text
// box, which drops line breaks, so objects are written on one line.
export function argumentText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

export const WEBHOOK_GROUPS = ["body", "query"];

/** True when the arguments hold a webhook's body or query as an object. The
 * dialogs then show only the values inside those, and other keys stay hidden. */
export function hasArgumentGroups(args: Record<string, unknown>): boolean {
  return WEBHOOK_GROUPS.some((k) => isPlainObject(args[k]));
}

// Text read back as the value it spells when it is valid JSON, so `7` edited
// to `8` is saved as 8, not "8".
function parseEdited(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** The dialog edits argument values as text, so a value it shows unchanged is
 * put back as the original value. Returns `previous` itself when nothing was
 * changed, which also keeps keys the dialog does not show. */
function restoreArguments(
  next: Record<string, unknown>,
  previous: Record<string, unknown>,
  nested = false,
): Record<string, unknown> {
  const webhook = !nested && hasArgumentGroups(previous);
  // A body or query with values was on screen, so its absence is a removal.
  const shown = (k: string) =>
    WEBHOOK_GROUPS.includes(k) &&
    isPlainObject(previous[k]) &&
    Object.keys(previous[k]).length > 0;
  let changed =
    Object.keys(next).some((k) => !(k in previous)) ||
    Object.keys(previous).some((k) => !(k in next) && (!webhook || shown(k)));
  const out: Record<string, unknown> = {};
  if (webhook) {
    for (const [k, v] of Object.entries(previous)) {
      if (!shown(k)) out[k] = v;
    }
  }
  for (const [k, v] of Object.entries(next)) {
    const before = previous[k];
    if (v === before) {
      out[k] = before;
    } else if (isPlainObject(v) && isPlainObject(before)) {
      out[k] = restoreArguments(v, before, true);
      if (out[k] !== before) changed = true;
    } else if (typeof v === "string" && v === argumentText(before)) {
      out[k] = before;
    } else {
      out[k] =
        typeof v === "string" &&
        before !== undefined &&
        typeof before !== "string"
          ? parseEdited(v)
          : v;
      changed = true;
    }
  }
  return changed ? out : previous;
}

/** Tool calls back from a dialog that edits argument values as text.
 * `storedIndex[i]` is the position in `previous` that call i was read from,
 * or undefined for a call added in the dialog. A call that still names the
 * same tool as its stored call gets the stored values back where its text is
 * unchanged. */
export function restoreToolCalls<
  T extends { tool: string; arguments: Record<string, unknown> },
>(next: T[], previous: unknown, storedIndex: (number | undefined)[]): T[] {
  const before = Array.isArray(previous) ? previous : [];
  return next.map((call, i) => {
    const at = storedIndex[i];
    if (at === undefined || before[at] === undefined) return call;
    const prior = normalizeToolCall(before[at]);
    if (prior.toolName !== call.tool) return call;
    return {
      ...call,
      arguments: restoreArguments(call.arguments, prior.args),
    };
  });
}

/** The position in `actual_tool_calls` a call was read from, taken from the
 * id payloadToHistory gave it. Undefined for a call added in the dialog. */
function storedCallIndex(id: string | undefined): number | undefined {
  const rest = id?.startsWith(ACTUAL_CALL_ID_PREFIX)
    ? id.slice(ACTUAL_CALL_ID_PREFIX.length)
    : "";
  return /^\d+$/.test(rest) ? Number(rest) : undefined;
}

/** A list field on save: the new list when it has entries. An empty list is
 * kept only when the item already stored an empty one, since an empty list
 * still marks a tool-call item. A list emptied by the reader is removed. */
export function keepList<T>(previous: unknown, next: T[]): T[] | undefined {
  if (next.length > 0) return next;
  return Array.isArray(previous) && previous.length === 0 ? [] : undefined;
}

/** The stored fields for the dialog's history. For an llm item, the agent's
 * tool calls (see actualToolCallsStart) become `actual_tool_calls`, and an
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
      tool_calls?: undefined;
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
  const callStart = actualToolCallsStart(
    history,
    (h) => (isCall(h) ? h.tool_calls?.[0]?.id : undefined),
    (h) => h.role === "tool",
  );
  const start = callStart >= 0 ? callStart : history.length;
  const trailing = history.slice(start);
  const replyIndex = isReply(history[start - 1]) ? start - 1 : -1;
  const reply = replyIndex >= 0 ? history[replyIndex] : undefined;
  const chat_history = history.slice(0, replyIndex >= 0 ? replyIndex : start);
  const agent_response = reply
    ? writeTextField(reply.content as string, {
        label: reply.label,
        versions: reply.versions,
      })
    : "";
  const before = agentToolCalls(previous ?? {});
  const read = trailing.filter(isCall).flatMap((turn) =>
    (turn.tool_calls ?? []).map((call) => {
      const { args } = normalizeToolCall(call);
      const response = trailing.find(
        (t) => t.role === "tool" && t.tool_call_id === call.id,
      );
      return {
        tool: call.function.name,
        arguments: args as Record<string, unknown>,
        content:
          typeof response?.content === "string" ? response.content : undefined,
        storedAt: storedCallIndex(call.id),
      };
    }),
  );
  const calls: ToolCallRecord[] = restoreToolCalls(
    read.map(({ tool, arguments: args, content, storedAt }) => {
      const prior =
        storedAt === undefined || before[storedAt] === undefined
          ? undefined
          : normalizeToolCall(before[storedAt]);
      const same = prior?.toolName === tool;
      const priorOutput = same ? prior?.output : undefined;
      let output: unknown;
      if (content !== undefined) {
        if (priorOutput !== undefined && content === outputText(priorOutput)) {
          output = priorOutput;
        } else if (!(
          same &&
          priorOutput === undefined &&
          (content === DEFAULT_STRUCTURED_RESPONSE ||
            content === DEFAULT_WEBHOOK_RESPONSE)
        )) {
          output = parseEdited(content);
        }
      }
      return {
        tool,
        arguments: args,
        ...(output !== undefined ? { output } : {}),
      };
    }),
    before,
    read.map((c) => c.storedAt),
  );
  return {
    chat_history,
    agent_response,
    actual_tool_calls: keepList(previous?.actual_tool_calls, calls),
    // The old field is cleared only when its calls were read into the dialog.
    ...(before.length > 0 && before === previous?.tool_calls
      ? { tool_calls: undefined }
      : {}),
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
