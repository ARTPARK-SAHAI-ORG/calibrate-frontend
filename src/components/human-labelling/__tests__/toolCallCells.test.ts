import { actualToolCallsCell, toolCallsCell } from "../toolCallCells";

const calls = [{ tool: "book_flight", arguments: {} }];

it("writes a tool-call list as JSON, keeps an empty list, and leaves anything else blank", () => {
  expect(toolCallsCell(calls)).toBe(JSON.stringify(calls));
  expect(toolCallsCell([])).toBe("[]");
  expect(toolCallsCell(undefined)).toBe("");
});

it("reads the agent's tool calls from actual_tool_calls or a reply-less tool_calls list", () => {
  expect(actualToolCallsCell({ actual_tool_calls: [] })).toBe("[]");
  expect(actualToolCallsCell({ tool_calls: calls })).toBe(JSON.stringify(calls));
  expect(actualToolCallsCell({ agent_response: "Hi", tool_calls: calls })).toBe("");
  expect(actualToolCallsCell({})).toBe("");
});
