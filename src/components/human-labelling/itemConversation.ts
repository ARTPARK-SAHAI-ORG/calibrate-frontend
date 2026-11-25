import type { TestConfig } from "@/components/AddTestDialog";
import {
  readTextField,
  writeTextField,
  type TextField,
  type TurnExtras,
} from "@/lib/messageVersions";
import { normaliseHistoryItem } from "./item-panes/shared";
import { agentToolCalls } from "@/lib/labellingItem";
import { normalizeToolCall } from "@/components/test-results/shared";
import type { ExpectedToolCall } from "@/components/ToolCallExpectationsEditor";
import type { AvailableTool, ToolCallParam } from "@/components/ToolPicker";
import { readToolParameters } from "@/lib/toolParams";

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

/** Where the graded answer starts: the agent's own tool calls (see
 * actualToolCallsStart), or the end of the conversation when it has none,
 * moved back over the agent's text reply just before. -1 when there is
 * neither. */
export function gradedAnswerStart<T>(
  turns: T[],
  callId: (turn: T) => string | undefined,
  isResponse: (turn: T) => boolean,
  isReply: (turn: T) => boolean,
): number {
  const calls = actualToolCallsStart(turns, callId, isResponse);
  const end = calls >= 0 ? calls : turns.length;
  return end > 0 && isReply(turns[end - 1]) ? end - 1 : calls;
}

/** Help text under the expected tool calls on a labelling item. */
export const EXPECTED_TOOL_CALLS_HELP =
  "Optional. Add the tool calls the agent should have made and the values it should have sent. Once you add one, this item is scored only by tool call evaluators, which compare the agent's tool calls with these.";

/** Why an evaluator does not score this item. */
export const skippedEvaluatorNote = (isToolCallItem: boolean) =>
  isToolCallItem
    ? "Does not score tool calls, so it is skipped for this item"
    : "Only scores tool calls, so it is skipped for this item";

type ToolCallRecord = Pick<ExpectedToolCall, "tool" | "arguments"> & {
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
// box, which drops line breaks, so objects are written on one line. Null is
// written out because these rows have no null switch, unlike the expected
// call editor's expectedValueToString.
function argumentText(value: unknown): string {
  if (value === null) return "null";
  if (value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Saved arguments as the dialogs' rows of text. With `grouped`, a webhook's
 * body and query values become rows tagged with their group. */
export function argumentRows(
  args: Record<string, unknown>,
  grouped: boolean,
): ToolCallParam[] {
  if (!grouped || !hasArgumentGroups(args)) {
    return Object.entries(args).map(([name, value]) => ({
      name,
      value: argumentText(value),
    }));
  }
  return WEBHOOK_GROUPS.flatMap((group) => {
    const values = args[group];
    return Object.entries(isPlainObject(values) ? values : {}).map(
      ([name, value]) => ({ name, value: argumentText(value), group }),
    );
  });
}

/** The typed-in rows, back to the arguments the tool call is saved with. */
export function paramsToArgs(params: ToolCallParam[]): Record<string, unknown> {
  if (!params.some((p) => p.group)) {
    return Object.fromEntries(params.map((p) => [p.name, p.value]));
  }
  const args: Record<string, Record<string, unknown>> = {};
  for (const p of params) {
    const group = p.group ?? "body";
    args[group] = { ...args[group], [p.name]: p.value };
  }
  return args;
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

const WEBHOOK_GROUPS = ["body", "query"];

/** True when the arguments hold a webhook's body or query as an object. The
 * dialogs then show only the values inside those, and other keys stay hidden. */
export function hasArgumentGroups(args: Record<string, unknown>): boolean {
  return WEBHOOK_GROUPS.some((k) => isPlainObject(args[k]));
}

// Text read back as the value it spells when it is valid JSON, so `7` edited
// to `8` is saved as 8, not "8". A whole number too long to keep exactly,
// such as 20 digits, stays text.
function parseEdited(text: string): unknown {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return text;
  }
  return typeof value === "number" &&
    Number.isInteger(value) &&
    !Number.isSafeInteger(value)
    ? text
    : value;
}

const VALUE_FITS_TYPE: Record<string, (v: unknown) => boolean> = {
  number: (v) => typeof v === "number",
  integer: Number.isInteger,
  boolean: (v) => typeof v === "boolean",
  object: isPlainObject,
  array: Array.isArray,
};

/** The data type the tool declares for each input, nested under `query` and
 * `body` for a webhook. */
function declaredTypes(
  tool: AvailableTool | undefined,
): Record<string, unknown> {
  const types = (config: Record<string, unknown> | undefined) =>
    Object.fromEntries(
      readToolParameters(config).map((p) => [p.name, p.dataType]),
    );
  const webhook = tool?.config?.type === "webhook" && tool.config.webhook;
  if (!webhook) return types(tool?.config);
  return {
    query: types({ parameters: webhook.queryParameters }),
    body: types({ parameters: webhook.body?.parameters }),
  };
}

function applyTypes(
  args: Record<string, unknown>,
  types: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(args).map(([k, v]) => {
      const type = types[k];
      if (isPlainObject(v) && isPlainObject(type)) {
        return [k, applyTypes(v, type)];
      }
      if (typeof v !== "string" || typeof type !== "string") return [k, v];
      const value = parseEdited(v);
      return [k, VALUE_FITS_TYPE[type]?.(value) ? value : v];
    }),
  );
}

/** Arguments typed into a dialog's text boxes, with each value the tool
 * declares as a number, true/false, object or list turned into one. Every
 * other value, and every value of a tool not in the list, stays text, so a
 * phone number typed into a text input is not saved as a number. */
export function typeArguments(
  args: Record<string, unknown>,
  tool: AvailableTool | undefined,
): Record<string, unknown> {
  return applyTypes(args, declaredTypes(tool));
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
    } else if (
      before !== undefined &&
      argumentText(v) === argumentText(before)
    ) {
      out[k] = before;
    } else {
      out[k] =
        before === undefined
          ? v
          : typeof before === "string"
            ? argumentText(v)
            : typeof v === "string"
              ? parseEdited(v)
              : v;
      changed = true;
    }
  }
  return changed ? out : previous;
}

function storedCall(before: unknown[], at: number | undefined) {
  return at === undefined || before[at] === undefined
    ? undefined
    : normalizeToolCall(before[at]);
}

/** Tool calls back from a dialog that edits argument values as text, after
 * typeArguments. `storedIndex[i]` is the position in `previous` that call i
 * was read from, or undefined for a call added in the dialog. A call read from
 * a stored call gets the stored values back where its text is unchanged, and
 * the stored call's `output`, even when its tool was renamed. An edited stored
 * text value stays text. */
export function restoreToolCalls<
  T extends { tool: string; arguments: Record<string, unknown> },
>(
  next: T[],
  previous: unknown,
  storedIndex: (number | undefined)[],
): (T & { output?: unknown })[] {
  const before = Array.isArray(previous) ? previous : [];
  return next.map((call, i) => {
    const prior = storedCall(before, storedIndex[i]);
    return {
      ...call,
      arguments: prior
        ? restoreArguments(call.arguments, prior.args)
        : call.arguments,
      ...(prior?.output !== undefined ? { output: prior.output } : {}),
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

/** Spread into a saved payload: removes the old `tool_calls` field when its
 * calls were the ones read into the dialog (`shown`), since they are now
 * saved as `actual_tool_calls`. */
export function clearOldToolCallsField(
  previous: Record<string, unknown> | undefined,
  shown: unknown[],
): { tool_calls?: undefined } {
  return shown.length > 0 && shown === previous?.tool_calls
    ? { tool_calls: undefined }
    : {};
}

/** A list field on save: the new list when it has entries. An empty list is
 * kept only when the item already stored an empty one, since an empty list
 * still marks a tool-call item. A list emptied in the dialog is removed. */
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
  const isReply = (h: HistoryItem) =>
    h.role === "assistant" && !isCall(h) && typeof h.content === "string";
  const answerStart = gradedAnswerStart(
    history,
    (h) => (isCall(h) ? h.tool_calls?.[0]?.id : undefined),
    (h) => h.role === "tool",
    isReply,
  );
  const reply =
    answerStart >= 0 && isReply(history[answerStart])
      ? history[answerStart]
      : undefined;
  const chat_history = history.slice(
    0,
    answerStart >= 0 ? answerStart : history.length,
  );
  const trailing =
    answerStart >= 0 ? history.slice(answerStart + (reply ? 1 : 0)) : [];
  const agent_response = reply
    ? writeTextField(reply.content as string, {
        label: reply.label,
        versions: reply.versions,
      })
    : "";
  const before = agentToolCalls(previous ?? {});
  const read = trailing.filter(isCall).flatMap((turn) =>
    (turn.tool_calls ?? []).map((call) => {
      const response = trailing.find(
        (t) => t.role === "tool" && t.tool_call_id === call.id,
      );
      return {
        tool: call.function.name,
        arguments: normalizeToolCall(call).args as Record<string, unknown>,
        content:
          typeof response?.content === "string" ? response.content : undefined,
        storedAt: storedCallIndex(call.id),
      };
    }),
  );
  const restored = restoreToolCalls(
    read,
    before,
    read.map((r) => r.storedAt),
  );
  const calls: ToolCallRecord[] = restored.map(
    ({ tool, arguments: args, content, storedAt }) => {
      const prior = storedCall(before, storedAt);
      const priorOutput = prior?.output;
      let output: unknown;
      if (content === undefined) {
        // The dialog shows no box for an empty stored reply, so it sends none.
        if (priorOutput === "") output = "";
      } else {
        if (priorOutput !== undefined && content === outputText(priorOutput)) {
          output = priorOutput;
        } else {
          output =
            typeof priorOutput === "string" ? content : parseEdited(content);
        }
      }
      return {
        tool,
        arguments: args,
        ...(output !== undefined ? { output } : {}),
      };
    },
  );
  return {
    chat_history,
    agent_response,
    actual_tool_calls: keepList(previous?.actual_tool_calls, calls),
    ...clearOldToolCallsField(previous, before),
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
