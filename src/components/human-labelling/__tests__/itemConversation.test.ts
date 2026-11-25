import {
  actualToolCallsStart,
  DEFAULT_STRUCTURED_RESPONSE,
  DEFAULT_WEBHOOK_RESPONSE,
  historyToPayloadFields,
  keepList,
  restoreToolCalls,
  payloadToHistory,
  textFieldsToPayload,
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

  it("saves trailing tool-call turns as actual_tool_calls, with the reply just before them as agent_response", () => {
    const history: HistoryItem[] = [
      { role: "user", content: "hi" },
      { role: "assistant", content: "checking" },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "actual-call-0",
            type: "function",
            function: { name: "lookup", arguments: '{"city":"Pune"}' },
          },
        ],
      },
      { role: "tool", content: '{"ok":true}', tool_call_id: "actual-call-0" },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "actual-call-1",
            type: "function",
            function: { name: "notify", arguments: "{}" },
          },
        ],
      },
      { role: "tool", content: "sent", tool_call_id: "actual-call-1" },
      { role: "assistant", tool_calls: [{ ...toolCall, id: "actual-call-2" }] },
    ];
    expect(historyToPayloadFields(history, "llm")).toEqual({
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: "checking",
      actual_tool_calls: [
        { tool: "lookup", arguments: { city: "Pune" }, output: { ok: true } },
        { tool: "notify", arguments: {}, output: "sent" },
        { tool: "lookup", arguments: {} },
      ],
    });
  });

  it("keeps earlier tool calls in chat_history when the agent ends on text", () => {
    const history: HistoryItem[] = [
      { role: "user", content: "hi" },
      { role: "assistant", tool_calls: [toolCall] },
      { role: "tool", content: "result", tool_call_id: "c1" },
      { role: "assistant", content: "done" },
    ];
    const fields = historyToPayloadFields(history, "llm");
    expect(fields).toEqual({
      chat_history: history.slice(0, -1),
      agent_response: "done",
    });
    expect("actual_tool_calls" in fields && fields.actual_tool_calls).toBe(
      undefined,
    );
  });

  it("keeps a history that ends on a user turn as it is", () => {
    const history: HistoryItem[] = [{ role: "user", content: "hi" }];
    expect(historyToPayloadFields(history, "llm")).toEqual({
      chat_history: history,
      agent_response: "",
    });
    expect(historyToPayloadFields([], "llm")).toEqual({
      chat_history: [],
      agent_response: "",
    });
  });

  it("round-trips an item whose answer is a tool call", () => {
    const payload = {
      chat_history: [{ role: "user", content: "book me a flight" }],
      agent_response: "",
      actual_tool_calls: [
        { tool: "book_flight", arguments: { city: "Pune" }, output: { id: 7 } },
        { tool: "notify", arguments: {} },
      ],
    };
    const history = payloadToHistory(payload, "llm");
    expect(history).toEqual([
      { role: "user", content: "book me a flight" },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "actual-call-0",
            type: "function",
            function: { name: "book_flight", arguments: '{"city":"Pune"}' },
          },
        ],
      },
      {
        role: "tool",
        content: '{\n  "id": 7\n}',
        tool_call_id: "actual-call-0",
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "actual-call-1",
            type: "function",
            function: { name: "notify", arguments: "{}" },
          },
        ],
      },
    ]);
    expect(historyToPayloadFields(history, "llm")).toEqual(payload);
  });

  it("keeps an earlier call at the end of chat_history out of actual_tool_calls", () => {
    const payload = {
      chat_history: [
        { role: "user", content: "save my city" },
        { role: "assistant", tool_calls: [toolCall] },
        { role: "tool", content: "Pune", tool_call_id: "c1" },
      ],
      agent_response: "",
      actual_tool_calls: [{ tool: "save", arguments: { city: "Pune" } }],
    };
    expect(
      historyToPayloadFields(payloadToHistory(payload, "llm"), "llm", payload),
    ).toEqual(payload);
  });

  it("reads calls stored under tool_calls and saves them unchanged", () => {
    const payload = {
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: "",
      tool_calls: [{ tool: "lookup", arguments: { n: 3 } }],
    };
    const history = throughTheDialog(payloadToHistory(payload, "llm"));
    expect(history[1].tool_calls?.[0].function.name).toBe("lookup");
    expect(
      historyToPayloadFields(history, "llm", payload),
    ).toMatchObject({
      actual_tool_calls: [{ tool: "lookup", arguments: { n: 3 } }],
    });
  });

  it("leaves calls under tool_calls alone on an item with a text reply", () => {
    const payload = {
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: "Hello",
      tool_calls: [{ tool: "lookup", arguments: { n: 3 } }],
    };
    const history = payloadToHistory(payload, "llm");
    expect(history.some((t) => t.tool_calls)).toBe(false);
    const fields = historyToPayloadFields(history, "llm", payload);
    expect(fields).not.toHaveProperty("tool_calls");
    expect(fields).not.toHaveProperty("actual_tool_calls", expect.anything());
  });

  it("reads a string tool output back as the same string", () => {
    const payload = {
      chat_history: [],
      agent_response: "",
      actual_tool_calls: [{ tool: "lookup", arguments: {}, output: "plain" }],
    };
    expect(
      historyToPayloadFields(payloadToHistory(payload, "llm"), "llm"),
    ).toEqual(payload);
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

describe("textFieldsToPayload", () => {
  it("writes a plain string unless a heading or version is set", () => {
    expect(
      textFieldsToPayload({
        input: "Summarise",
        output: "A summary",
        inputExtras: { label: "English", versions: { Hindi: "सार" } },
        outputExtras: {},
      }),
    ).toEqual({
      input: { content: "Summarise", label: "English", versions: { Hindi: "सार" } },
      output: "A summary",
    });
  });
});

// What the item dialog sends back for a history it was given and not edited:
// every argument value becomes the text shown in its box, and a call with no
// response gets the default response box filled in.
function throughTheDialog(history: HistoryItem[]): HistoryItem[] {
  const text = (v: unknown) =>
    v === null
      ? "null"
      : typeof v === "object"
        ? JSON.stringify(v)
        : String(v);
  const out: HistoryItem[] = [];
  history.forEach((turn, i) => {
    if (!turn.tool_calls) {
      out.push(turn);
      return;
    }
    const call = turn.tool_calls[0];
    const args = JSON.parse(call.function.arguments);
    const asText = (obj: Record<string, unknown>): Record<string, unknown> =>
      Object.fromEntries(
        Object.entries(obj)
          .filter(([k]) => k !== "headers")
          .map(([k, v]) =>
            (k === "body" || k === "query") && v && typeof v === "object"
              ? [k, asText(v as Record<string, unknown>)]
              : [k, text(v)],
          ),
      );
    out.push({
      ...turn,
      tool_calls: [
        { ...call, function: { ...call.function, arguments: JSON.stringify(asText(args)) } },
      ],
    });
    if (history[i + 1]?.role !== "tool") {
      out.push({
        role: "tool",
        content: args.body ? DEFAULT_WEBHOOK_RESPONSE : DEFAULT_STRUCTURED_RESPONSE,
        tool_call_id: call.id,
      });
    }
  });
  return out;
}

describe("saving an item opened in the dialog", () => {
  const payload = {
    chat_history: [{ role: "user", content: "book it" }],
    agent_response: "On it",
    actual_tool_calls: [
      {
        tool: "book_flight",
        arguments: { seats: 3, refundable: false, route: { from: "BLR" }, note: null },
      },
      {
        tool: "notify",
        arguments: { body: { id: 7 }, query: { q: "x" }, headers: { k: "v" } },
      },
      { tool: "lookup", arguments: { city: "Pune" }, output: { temp: 30 } },
    ],
  };

  it("saves the stored tool calls exactly when nothing was changed", () => {
    const history = throughTheDialog(payloadToHistory(payload, "llm"));
    expect(historyToPayloadFields(history, "llm", payload)).toEqual(payload);
  });

  it("keeps an edited value as typed and the rest as stored", () => {
    const history = throughTheDialog(payloadToHistory(payload, "llm"));
    const edited = history.map((t) =>
      t.tool_calls?.[0].function.name === "book_flight"
        ? {
            ...t,
            tool_calls: [
              {
                ...t.tool_calls[0],
                function: {
                  name: "book_flight",
                  arguments: JSON.stringify({
                    ...JSON.parse(t.tool_calls[0].function.arguments),
                    seats: "4",
                  }),
                },
              },
            ],
          }
        : t,
    );
    const fields = historyToPayloadFields(edited, "llm", payload) as {
      actual_tool_calls: { arguments: Record<string, unknown> }[];
    };
    expect(fields.actual_tool_calls[0].arguments).toEqual({
      seats: 4,
      refundable: false,
      route: { from: "BLR" },
      note: null,
    });
  });

  it("removes calls stored under tool_calls when every call is removed", () => {
    const stored = {
      chat_history: [{ role: "user", content: "book it" }],
      agent_response: "On it",
      tool_calls: [{ tool: "book_flight", arguments: { seats: 3 } }],
    };
    const withoutCalls = payloadToHistory(stored, "llm").filter(
      (t) => !t.tool_calls && t.role !== "tool",
    );
    const saved = {
      ...stored,
      ...historyToPayloadFields(withoutCalls, "llm", stored),
    };
    expect(
      payloadToHistory(saved, "llm").some((t) => t.tool_calls),
    ).toBe(false);
  });

  it("keeps the text reply of an item that also has tool calls", () => {
    const fields = historyToPayloadFields(
      payloadToHistory(payload, "llm"),
      "llm",
      payload,
    );
    expect(fields).toMatchObject({
      chat_history: payload.chat_history,
      agent_response: "On it",
    });
  });

  it("keeps a stored empty tool-call list and drops one the reader emptied", () => {
    const empty = {
      chat_history: [{ role: "user", content: "hi" }],
      agent_response: "hello",
      actual_tool_calls: [],
    };
    expect(
      historyToPayloadFields(payloadToHistory(empty, "llm"), "llm", empty),
    ).toEqual(empty);
    const cleared = historyToPayloadFields(
      [
        { role: "user", content: "book it" },
        { role: "assistant", content: "Booked" },
      ],
      "llm",
      payload,
    );
    expect(cleared).toEqual({
      chat_history: [{ role: "user", content: "book it" }],
      agent_response: "Booked",
    });
    expect("actual_tool_calls" in cleared && cleared.actual_tool_calls).toBe(
      undefined,
    );
  });
});

describe("keepList", () => {
  it("keeps entries, keeps a stored empty list, and leaves out the rest", () => {
    expect(keepList(undefined, [1])).toEqual([1]);
    expect(keepList([], [])).toEqual([]);
    expect(keepList([1], [])).toBeUndefined();
    expect(keepList(undefined, [])).toBeUndefined();
  });
});

describe("actualToolCallsStart", () => {
  const turns = (...ids: (string | null)[]) => ids;
  const callId = (t: string | null) => (t === null ? undefined : t);
  const isResponse = (t: string | null) => t === "response";
  it("starts at the agent's own calls and leaves an earlier call and its response before them", () => {
    expect(
      actualToolCallsStart(
        turns(null, "c1", "response", "actual-call-0", "response"),
        (t) => (t === "response" ? undefined : callId(t)),
        isResponse,
      ),
    ).toBe(3);
  });
  it("is -1 when the conversation ends on an earlier call or a response alone", () => {
    expect(actualToolCallsStart(turns(null, "c1"), callId, isResponse)).toBe(-1);
    expect(
      actualToolCallsStart(
        turns(null, "response"),
        (t) => (t === "response" ? undefined : callId(t)),
        isResponse,
      ),
    ).toBe(-1);
  });
});

describe("restoreToolCalls", () => {
  it("puts back stored values whose text is unchanged, for the same tool only", () => {
    const stored = [
      { tool: "a", arguments: { n: 3, ok: true } },
      { tool: "b", arguments: { n: 3 } },
    ];
    expect(
      restoreToolCalls(
        [
          { tool: "a", arguments: { n: "3", ok: true } },
          { tool: "c", arguments: { n: "3" } },
          { tool: "d", arguments: {} },
        ],
        stored,
      ),
    ).toEqual([
      { tool: "a", arguments: { n: 3, ok: true } },
      { tool: "c", arguments: { n: "3" } },
      { tool: "d", arguments: {} },
    ]);
  });

  it("drops an argument the reader removed", () => {
    expect(
      restoreToolCalls(
        [{ tool: "a", arguments: { n: 3 } }],
        [{ tool: "a", arguments: { n: 3, extra: 1 } }],
      ),
    ).toEqual([{ tool: "a", arguments: { n: 3 } }]);
  });
});

describe("restoreToolCalls with webhook arguments", () => {
  it("keeps hidden keys when nothing changed and drops a removed body value", () => {
    const stored = [
      { tool: "w", arguments: { body: { id: 7, x: 1 }, headers: { k: "v" } } },
    ];
    expect(
      restoreToolCalls([{ tool: "w", arguments: { body: { id: 7, x: 1 } } }], stored),
    ).toEqual(stored);
    expect(
      restoreToolCalls([{ tool: "w", arguments: { body: { id: 7 } } }], stored),
    ).toEqual([{ tool: "w", arguments: { body: { id: 7 }, headers: { k: "v" } } }]);
  });

  it("drops a body the reader emptied", () => {
    const stored = [
      { tool: "w", arguments: { body: { id: 7 }, headers: { k: "v" } } },
    ];
    expect(restoreToolCalls([{ tool: "w", arguments: {} }], stored)).toEqual([
      { tool: "w", arguments: { headers: { k: "v" } } },
    ]);
  });

  it("treats a call with no body or query object as plain arguments", () => {
    expect(
      restoreToolCalls(
        [{ tool: "w", arguments: { city: "Pune" } }],
        [{ tool: "w", arguments: { city: "Pune", body: "raw" } }],
      ),
    ).toEqual([{ tool: "w", arguments: { city: "Pune" } }]);
  });

  it("keeps the headers when the query is edited", () => {
    const stored = [
      { tool: "w", arguments: { query: { q: "x" }, headers: { k: "v" } } },
    ];
    expect(
      restoreToolCalls([{ tool: "w", arguments: { query: { q: "y" } } }], stored),
    ).toEqual([{ tool: "w", arguments: { query: { q: "y" }, headers: { k: "v" } } }]);
  });
});
