import { isToolCallOutputItem } from "../itemOutputType";

describe("isToolCallOutputItem", () => {
  it("is false for non-object payloads", () => {
    expect(isToolCallOutputItem(null)).toBe(false);
    expect(isToolCallOutputItem(undefined)).toBe(false);
    expect(isToolCallOutputItem("nope")).toBe(false);
    expect(isToolCallOutputItem(42)).toBe(false);
  });

  it("is true when the agent actually called a tool", () => {
    expect(
      isToolCallOutputItem({
        actual_tool_calls: [{ function: { name: "book" } }],
        expected_tool_calls: [{ function: { name: "book" } }],
      }),
    ).toBe(true);
  });

  it("is true for a trace with actual calls but no expected spec", () => {
    expect(
      isToolCallOutputItem({
        actual_tool_calls: [{ function: { name: "book" } }],
        expected_tool_calls: [],
      }),
    ).toBe(true);
  });

  it("is true for a FAILED tool-call test: no actual call, but an expected spec", () => {
    // The agent replied with text instead of calling the tool. The item still
    // carries both tool-call arrays (actual empty), so it must read as a
    // tool-call item to label, not as a plain reply.
    expect(
      isToolCallOutputItem({
        actual_tool_calls: [],
        expected_tool_calls: [{ function: { name: "book" } }],
        agent_response: "calling a tool with param success true",
      }),
    ).toBe(true);
  });

  it("is true when only the tool-call arrays are present, both empty", () => {
    // Presence of the keys is the marker, not their length.
    expect(
      isToolCallOutputItem({ actual_tool_calls: [], expected_tool_calls: [] }),
    ).toBe(true);
  });

  it("is true for a plain llm reply that was itself a tool call", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "",
        chat_history: [
          { role: "user", content: "Book it" },
          { role: "assistant", tool_calls: [{ function: { name: "book" } }] },
        ],
      }),
    ).toBe(true);
  });

  it("is false for a normal response item with a text reply", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "Sure, I can help with that.",
        chat_history: [{ role: "user", content: "Hi" }],
      }),
    ).toBe(false);
  });

  it("is false for an empty reply with no tool call in history", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "",
        chat_history: [
          { role: "user", content: "Hi" },
          { role: "assistant", content: "Hello" },
        ],
      }),
    ).toBe(false);
  });

  it("is false for an empty reply whose last assistant turn has no tool_calls", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "",
        chat_history: [{ role: "assistant", content: "no tools here" }],
      }),
    ).toBe(false);
  });
});
