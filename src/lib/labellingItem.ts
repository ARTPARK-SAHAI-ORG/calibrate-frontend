// Shrinks a task's item row down to the shape ItemDetailDialog wants,
// field by field, when the item detail view is opened from the task's
// Items tab.
//
// Pulled out of the page so it can be unit tested directly: the page it was
// inline in sits outside what the coverage setup measures, and dropping a
// field silently here is exactly the bug that made the dialog draw every
// evaluator on a tool-call item instead of just Tool call correctness.
import type { EvaluatorType } from "@/components/EvaluatorPills";
import type { ExpectedToolCall } from "@/components/ToolCallExpectationsEditor";
import type { MetadataEntry } from "@/components/ui";
import { agentToolCalls } from "@/components/human-labelling/item-panes/shared";
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
