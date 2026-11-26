import type { EvaluatorType } from "@/components/EvaluatorPills";
import type { ExpectedToolCall } from "@/components/ToolCallExpectationsEditor";
import type { MetadataEntry } from "@/components/ui";
import { readTurnExtras, textOf, type TurnExtras } from "@/lib/messageVersions";

export type ItemDetailSourceItem = {
  id: number;
  uuid: string;
  task_id: string;
  payload: unknown;
  created_at: string;
  deleted_at: string | null;
  is_tool_call?: boolean;
  metadata?: MetadataEntry[] | null;
};

// Shrinks a task's item row down to the shape ItemDetailDialog wants.
export function toItemDetailItem(
  match: ItemDetailSourceItem,
): ItemDetailSourceItem {
  return {
    id: match.id,
    uuid: match.uuid,
    task_id: match.task_id,
    payload: match.payload,
    created_at: match.created_at,
    deleted_at: match.deleted_at,
    is_tool_call: match.is_tool_call,
    metadata: match.metadata,
  };
}

// The evaluator kinds a labelling task of this type can use. Any row of an
// `llm` or `llm-general` task can be a tool call, so those also take the
// tool-call kind.
export function evaluatorTypesForTask(
  taskType: EvaluatorType,
): EvaluatorType[] {
  return taskType === "llm" || taskType === "llm-general"
    ? [taskType, "tool-call"]
    : [taskType];
}

export function fitsTaskType(
  evaluatorType: EvaluatorType | undefined,
  taskType: EvaluatorType,
): boolean {
  return (
    !!evaluatorType && evaluatorTypesForTask(taskType).includes(evaluatorType)
  );
}

// A tool-call evaluator judges only tool-call rows, and every other evaluator
// only the rest. The backend applies the same rule when it runs the judges.
export function evaluatorFitsItem(
  evaluatorType: string | null | undefined,
  isToolCallItem: boolean,
): boolean {
  return (evaluatorType === "tool-call") === isToolCallItem;
}

// An evaluator is offered when it fits at least one of the items. With no
// items to check, every evaluator is offered.
export function evaluatorsFittingItems<
  E extends { evaluator_type?: string | null },
>(evaluators: E[], items: { is_tool_call?: boolean }[]): E[] {
  if (items.length === 0) return evaluators;
  return evaluators.filter((e) =>
    items.some((it) => evaluatorFitsItem(e.evaluator_type, it.is_tool_call === true)),
  );
}

// Mirrors the backend's select-all rule: a case-insensitive substring of
// `payload.name`, so the kinds counted here are the items the action reaches.
export function selectedTaskItems<
  T extends { uuid: string; payload: unknown },
>(items: T[], pick: { q: string } | { ids: Set<string> }): T[] {
  if ("ids" in pick) return items.filter((it) => pick.ids.has(it.uuid));
  const needle = pick.q.trim().toLowerCase();
  if (!needle) return items;
  return items.filter((it) => {
    const name = (it.payload as { name?: unknown } | null)?.name;
    return typeof name === "string" && name.toLowerCase().includes(needle);
  });
}

export type ItemEditForm = "tts" | "stt" | "llm-general" | "chat";

/** Which edit form opens an item of a task type. `llm` and `conversation`
 *  items share the chat form. */
export function itemEditForm(taskType: string | undefined): ItemEditForm {
  if (taskType === "tts" || taskType === "stt" || taskType === "llm-general") {
    return taskType;
  }
  return "chat";
}

// Reads saved evaluator variable values from an item payload, indexed by
// evaluator uuid → { var: value }.
export function readEvaluatorVariables(
  payload: Record<string, unknown> | null,
): Record<string, Record<string, string>> {
  if (!payload) return {};
  const ev = payload.evaluator_variables;
  if (!ev || typeof ev !== "object" || Array.isArray(ev)) return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [k, v] of Object.entries(ev as Record<string, unknown>)) {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const inner: Record<string, string> = {};
      for (const [vk, vv] of Object.entries(v as Record<string, unknown>)) {
        if (typeof vv === "string") inner[vk] = vv;
      }
      out[k] = inner;
    }
  }
  return out;
}

export type LlmGeneralDialogRow = {
  uuid: string;
  name: string;
  description: string;
  input: string;
  output: string;
  inputExtras: TurnExtras;
  outputExtras: TurnExtras;
  toolCalls: unknown[];
  expectedToolCalls: ExpectedToolCall[];
  varValues: Record<string, Record<string, string>>;
  metadata?: MetadataEntry[] | null;
};

// Seeds the llm-general add/edit dialog from a saved item. Edit and duplicate
// both go through it, so a field one of them carries the other cannot drop.
export function llmGeneralDialogRow(item: {
  uuid: string;
  payload: unknown;
  metadata?: MetadataEntry[] | null;
}): LlmGeneralDialogRow {
  const p = (item.payload ?? {}) as Record<string, unknown>;
  return {
    uuid: item.uuid,
    name: typeof p.name === "string" ? p.name : "",
    description: typeof p.description === "string" ? p.description : "",
    input: textOf(p.input),
    output: textOf(p.output),
    inputExtras: readTurnExtras(p.input),
    outputExtras: readTurnExtras(p.output),
    toolCalls: agentToolCalls(p),
    expectedToolCalls: Array.isArray(p.expected_tool_calls)
      ? p.expected_tool_calls
      : [],
    varValues: readEvaluatorVariables(p),
    metadata: item.metadata,
  };
}

export function isToolCallContent(content: Record<string, unknown>): boolean {
  return (
    Array.isArray(content.actual_tool_calls) ||
    Array.isArray(content.expected_tool_calls)
  );
}

// An empty expected or actual tool call list is kept on save and still marks
// the item as a tool-call item.
export function storesEmptyToolCallList(payload: unknown): boolean {
  const p = (payload ?? {}) as Record<string, unknown>;
  return [p.expected_tool_calls, p.actual_tool_calls].some(
    (list) => Array.isArray(list) && list.length === 0,
  );
}

/** The tool calls the agent made: `actual_tool_calls` whenever it is a list,
 * even an empty one, else `tool_calls` when the item has no text reply. The
 * backend reads the same. */
export function agentToolCalls(payload: Record<string, unknown>): unknown[] {
  if (Array.isArray(payload.actual_tool_calls)) return payload.actual_tool_calls;
  if (textOf(payload.agent_response) || textOf(payload.output)) return [];
  return Array.isArray(payload.tool_calls) ? payload.tool_calls : [];
}
