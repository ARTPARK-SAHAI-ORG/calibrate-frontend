import { actualToolCallsCell, buildItemsCsv, toolCallsCell } from "../itemsCsv";

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

it("writes a tool-call list as JSON, keeps an empty list, and leaves anything else blank", () => {
  expect(toolCallsCell(calls)).toBe(JSON.stringify(calls));
  expect(toolCallsCell([])).toBe("[]");
  expect(toolCallsCell(undefined)).toBe("");
});

it("reads the agent's tool calls from actual_tool_calls or tool_calls", () => {
  expect(actualToolCallsCell({ actual_tool_calls: [] })).toBe("[]");
  expect(actualToolCallsCell({ tool_calls: calls })).toBe(JSON.stringify(calls));
  expect(actualToolCallsCell({ agent_response: "Hi", tool_calls: calls })).toBe(JSON.stringify(calls));
  expect(actualToolCallsCell({})).toBe("");
});
