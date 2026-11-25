import { buildItemsCsv, selectedTaskItems } from "../itemsCsv";

const calls = [{ tool: "book_flight", arguments: { to: "BLR" } }];

it.each(["llm", "llm-general"])(
  "puts a %s item's actual and expected tool calls in the CSV, keeping an empty list",
  (type) => {
    const { columns, rows } = buildItemsCsv(
      [
        { uuid: "i-1", payload: { name: "Books", actual_tool_calls: calls, expected_tool_calls: calls } },
        { uuid: "i-2", payload: { name: "Answers in words", actual_tool_calls: [], expected_tool_calls: [] } },
        { uuid: "i-3", payload: { name: "Plain", agent_response: "Hi", output: "Hi" } },
      ],
      null,
      type,
    );
    expect(columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(["actual_tool_calls", "expected_tool_calls"]),
    );
    expect(rows.map((r) => [r.actual_tool_calls, r.expected_tool_calls])).toEqual([
      [JSON.stringify(calls), JSON.stringify(calls)],
      ["[]", "[]"],
      ["", ""],
    ]);
  },
);

it("leaves the tool-call columns out of other task types", () => {
  const { columns } = buildItemsCsv([], null, "conversation");
  expect(columns.map((c) => c.key)).not.toContain("actual_tool_calls");
});

describe("selectedTaskItems", () => {
  const items = [
    { uuid: "a", payload: { name: "Books a Flight" } },
    { uuid: "b", payload: { name: "Plain reply" } },
    { uuid: "c", payload: {} },
  ];

  it("narrows select all by a case-insensitive part of the item name", () => {
    expect(selectedTaskItems(items, { q: " flight " }).map((i) => i.uuid)).toEqual(["a"]);
  });

  it("keeps every item for select all with no search", () => {
    expect(selectedTaskItems(items, { q: "" })).toHaveLength(3);
  });

  it("keeps only the ticked items otherwise", () => {
    expect(selectedTaskItems(items, { ids: new Set(["b"]) }).map((i) => i.uuid)).toEqual(["b"]);
  });
});
