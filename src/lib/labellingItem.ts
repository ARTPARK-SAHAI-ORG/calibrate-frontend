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
