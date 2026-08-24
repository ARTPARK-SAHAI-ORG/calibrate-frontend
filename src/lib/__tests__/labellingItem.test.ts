import { toItemDetailItem } from "../labellingItem";

// Written after this exact mistake shipped: the object was built inline,
// field by field, and is_tool_call was left off the list. The dialog then
// always saw it as missing and drew every evaluator on every item.
describe("toItemDetailItem", () => {
  const base = {
    id: 1,
    uuid: "item-1",
    task_id: "task-1",
    payload: { name: "Item" },
    created_at: "2024-01-01",
    deleted_at: null,
  };

  it("carries is_tool_call through when the item has it", () => {
    expect(toItemDetailItem({ ...base, is_tool_call: true })).toMatchObject({
      is_tool_call: true,
    });
    expect(toItemDetailItem({ ...base, is_tool_call: false })).toMatchObject({
      is_tool_call: false,
    });
  });

  it("carries every other field through unchanged", () => {
    expect(toItemDetailItem({ ...base, is_tool_call: true })).toEqual({
      ...base,
      is_tool_call: true,
    });
  });

  it("leaves is_tool_call undefined when the source item has none", () => {
    expect(toItemDetailItem(base).is_tool_call).toBeUndefined();
  });
});
