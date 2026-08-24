// Shrinks a task's item row down to the shape ItemDetailDialog wants,
// field by field, when the item detail view is opened from the task's
// Items tab.
//
// Pulled out of the page so it can be unit tested directly: the page it was
// inline in sits outside what the coverage setup measures, and dropping a
// field silently here is exactly the bug that made the dialog draw every
// evaluator on a tool-call item instead of just Tool call correctness.
export type ItemDetailSourceItem = {
  id: number;
  uuid: string;
  task_id: string;
  payload: unknown;
  created_at: string;
  deleted_at: string | null;
  is_tool_call?: boolean;
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
  };
}

// What running the AI judges over a chosen set of rows should do. A judge has
// no wording to read on a tool call, so the backend skips those rows: a set of
// nothing but tool calls has nothing to run and is refused before the run
// dialog opens, and a mixed set runs with `toolCallSkipCount` saying how many
// are left out, so the reader is told before confirming.
//
// `is_tool_call` is stamped by the backend and absent on an older response, so
// an unknown row counts as a normal one. The backend applies the same rule, so
// erring that way only costs a round trip.
export function runEvaluatorsDecision(
  rows: { is_tool_call?: boolean }[],
): { blocked: true } | { blocked: false; toolCallSkipCount: number } {
  const toolCallSkipCount = rows.filter((r) => r.is_tool_call === true).length;
  if (rows.length > 0 && toolCallSkipCount === rows.length) {
    return { blocked: true };
  }
  return { blocked: false, toolCallSkipCount };
}

// True when an evaluation run recorded no score for a row because the AI
// judge does not run on it. The backend writes such a result on every
// tool-call row so the run page can say why the card is empty, rather than
// leaving a blank one behind.
export function isSkippedRunResult(
  value: { skipped?: unknown } | null | undefined,
): boolean {
  return value?.skipped === true;
}
