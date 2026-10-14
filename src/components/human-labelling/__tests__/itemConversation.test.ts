import {
  historyToPayloadFields,
  payloadToHistory,
  type HistoryItem,
} from "../itemConversation";

const toolCall = {
  id: "c1",
  type: "function" as const,
  function: { name: "lookup", arguments: "{}" },
};

describe("payloadToHistory", () => {
  it("appends a string reply as the trailing assistant turn", () => {
    expect(
      payloadToHistory(
        {
          chat_history: [{ role: "user", content: "hi" }],
          agent_response: "hello",
        },
        "llm",
      ),
    ).toEqual([
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ]);
  });

  it("carries label and versions off an object reply", () => {
    expect(
      payloadToHistory(
        {
          chat_history: [],
          agent_response: {
            content: "hello",
            label: "English",
            versions: { Hindi: "namaste" },
          },
        },
        "llm",
      ),
    ).toEqual([
      {
        role: "assistant",
        content: "hello",
        label: "English",
        versions: { Hindi: "namaste" },
      },
    ]);
  });

  it("skips an empty or unreadable reply", () => {
    expect(
      payloadToHistory({ chat_history: [], agent_response: "" }, "llm"),
    ).toEqual([]);
    expect(
      payloadToHistory({ chat_history: [], agent_response: 5 }, "llm"),
    ).toEqual([]);
    expect(payloadToHistory({}, "llm")).toEqual([]);
  });

  it("keeps label, versions and created_at on every turn and drops junk", () => {
    expect(
      payloadToHistory(
        {
          chat_history: [
            {
              role: "user",
              content: "hi",
              label: "English",
              versions: { Hindi: "namaste" },
              created_at: "2026-01-01T00:00:00Z",
              extra: "dropped",
            },
            { role: "assistant", content: 3 },
            null,
            { role: "system", content: "x" },
          ],
        },
        "llm",
      ),
    ).toEqual([
      {
        role: "user",
        content: "hi",
        label: "English",
        versions: { Hindi: "namaste" },
        created_at: "2026-01-01T00:00:00Z",
      },
    ]);
  });

  it("keeps tool-call and tool turns", () => {
    expect(
      payloadToHistory(
        {
          chat_history: [
            { role: "assistant", tool_calls: [toolCall] },
            { role: "tool", content: "result", tool_call_id: "c1" },
          ],
          agent_response: "done",
        },
        "llm",
      ),
    ).toEqual([
      { role: "assistant", tool_calls: [toolCall] },
      { role: "tool", content: "result", tool_call_id: "c1" },
      { role: "assistant", content: "done" },
    ]);
  });

  it("keeps a tool-call turn's text and a tool turn without an id", () => {
    expect(
      payloadToHistory(
        {
          chat_history: [
            { role: "assistant", content: "calling", tool_calls: [toolCall] },
            { role: "tool", content: "result" },
          ],
        },
        "llm",
      ),
    ).toEqual([
      { role: "assistant", content: "calling", tool_calls: [toolCall] },
      { role: "tool", content: "result" },
    ]);
  });

  it("reads a conversation item's transcript and ignores agent_response", () => {
    expect(
      payloadToHistory(
        {
          transcript: [
            { role: "user", content: "hi", label: "English" },
            { role: "assistant", content: "hello" },
          ],
          agent_response: "ignored",
        },
        "conversation",
      ),
    ).toEqual([
      { role: "user", content: "hi", label: "English" },
      { role: "assistant", content: "hello" },
    ]);
  });
});

describe("historyToPayloadFields", () => {
  it("round-trips an object reply back to the object form", () => {
    const payload = {
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: {
        content: "hello",
        label: "English",
        versions: { Hindi: "namaste" },
      },
    };
    expect(
      historyToPayloadFields(payloadToHistory(payload, "llm"), "llm"),
    ).toEqual(payload);
  });

  it("writes a plain string when the reply has no label or versions", () => {
    const history: HistoryItem[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "hello" },
    ];
    expect(historyToPayloadFields(history, "llm")).toEqual({
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: "hello",
    });
  });

  it("keeps a trailing tool-call turn in chat_history", () => {
    const history: HistoryItem[] = [
      { role: "user", content: "hi" },
      { role: "assistant", tool_calls: [toolCall] },
    ];
    expect(historyToPayloadFields(history, "llm")).toEqual({
      chat_history: history,
      agent_response: "",
    });
    expect(historyToPayloadFields([], "llm")).toEqual({
      chat_history: [],
      agent_response: "",
    });
  });

  it("passes a transcript through with its label and versions", () => {
    const history: HistoryItem[] = [
      {
        role: "user",
        content: "hi",
        label: "English",
        versions: { Hindi: "namaste" },
      },
      { role: "assistant", content: "hello" },
    ];
    expect(historyToPayloadFields(history, "conversation")).toEqual({
      transcript: history,
    });
  });
});
