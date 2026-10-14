// Shrinks a task's item row down to the shape ItemDetailDialog wants,
// field by field, when the item detail view is opened from the task's
// Items tab.
//
// Pulled out of the page so it can be unit tested directly: the page it was
// inline in sits outside what the coverage setup measures, and dropping a
// field silently here is exactly the bug that made the dialog draw every
// evaluator on a tool-call item instead of just Tool call correctness.
import type { MetadataEntry } from "@/components/ui";
import { textOf } from "@/lib/messageVersions";

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

// What running the AI judges over a chosen set of rows should do. A judge has
// no wording to read on a tool call, so the backend skips those rows: a set of
// nothing but tool calls has nothing to run and is refused before the run
// dialog opens. A mixed set runs on `runnable` alone, so a tool-call row never
// reaches the run at all, and `toolCallSkipCount` says how many were left out
// so the reader is told before confirming.
//
// `is_tool_call` is stamped by the backend and absent on an older response, so
// an unknown row counts as a normal one. The backend applies the same rule, so
// erring that way only costs a round trip.
export function runEvaluatorsDecision<T extends { is_tool_call?: boolean }>(
  rows: T[],
):
  | { blocked: true }
  | { blocked: false; toolCallSkipCount: number; runnable: T[] } {
  const runnable = rows.filter((r) => r.is_tool_call !== true);
  const toolCallSkipCount = rows.length - runnable.length;
  if (rows.length > 0 && runnable.length === 0) {
    return { blocked: true };
  }
  return { blocked: false, toolCallSkipCount, runnable };
}

// True when an evaluation run recorded no score for a row because the AI
// judge does not run on it. The backend writes such a result on every
// tool-call row so the run page can say why the card is empty, rather than
// leaving a blank one behind.
export function isSkippedRunResult(
  value: { skipped?: unknown; value?: unknown } | null | undefined,
): boolean {
  return value?.skipped === true;
}

// The evaluators an evaluation run can actually use. Tool call correctness is
// answered by people, never by a run, so it is left out of the Run evaluators
// dialog rather than offered as something to start.
export function evaluatorsThatCanBeRun<
  T extends { evaluator_type?: string },
>(evaluators: T[]): T[] {
  return evaluators.filter((e) => e.evaluator_type !== "tool-call");
}

// The one sentence the app uses about a tool-call row nothing can score. It
// appears in four places — the greyed-out Evaluate button, the refusal when
// every chosen row is one, the note in the run dialog, and the card on the
// evaluation run page — and they must not drift apart, so they are all built
// here. `subject` names who is doing the evaluating, `tail` adds anything that
// only one of them says.
export function toolCallNotEvaluatedMessage(
  subject: string,
  tail = "",
): string {
  return `${subject} one or more tool calls, which only supports human review today. Evaluators do not run on them${tail}.`;
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
  toolCalls: unknown[];
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
    toolCalls: Array.isArray(p.actual_tool_calls) ? p.actual_tool_calls : [],
    varValues: readEvaluatorVariables(p),
    metadata: item.metadata,
  };
}
