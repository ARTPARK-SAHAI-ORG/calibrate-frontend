import { isToolCallOutputItem } from "../itemOutputType";

describe("isToolCallOutputItem", () => {
  it("is false for a text response", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "Hello there",
        chat_history: [{ role: "user", content: "hi" }],
      }),
    ).toBe(false);
  });

  it("is true when the reply is empty and the last assistant turn is a tool call", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "",
        chat_history: [
          { role: "user", content: "book it" },
          {
            role: "assistant",
            tool_calls: [{ id: "1", type: "function", function: { name: "book" } }],
          },
        ],
      }),
    ).toBe(true);
  });

  it("looks past a trailing tool-result turn to the assistant tool call", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "",
        chat_history: [
          { role: "assistant", tool_calls: [{ id: "1", function: { name: "x" } }] },
          { role: "tool", tool_call_id: "1", content: "{}" },
        ],
      }),
    ).toBe(true);
  });

  it("a non-empty reply wins even if a tool call is in history", () => {
    expect(
      isToolCallOutputItem({
        agent_response: "Booked!",
        chat_history: [
          { role: "assistant", tool_calls: [{ id: "1", function: { name: "x" } }] },
        ],
      }),
    ).toBe(false);
  });

  it("is false for an empty reply with no tool call", () => {
    expect(
      isToolCallOutputItem({ agent_response: "", chat_history: [{ role: "user", content: "hi" }] }),
    ).toBe(false);
    expect(isToolCallOutputItem({})).toBe(false);
    expect(isToolCallOutputItem(null)).toBe(false);
  });
});
