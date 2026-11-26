import {
  actualToolCallsCell,
  buildItemsCsv,
  sanitizeCsvName,
  toolCallsCell,
} from "../itemsCsv";

const calls = [{ tool: "book_flight", arguments: { to: "BLR" } }];

it.each(["llm", "llm-general"])(
  "puts a %s item's actual and expected tool calls in the CSV, keeping an empty list",
  (type) => {
    const { columns, rows } = buildItemsCsv(
      [
        {
          uuid: "i-1",
          payload: {
            name: "Books",
            actual_tool_calls: calls,
            expected_tool_calls: calls,
          },
        },
        {
          uuid: "i-2",
          payload: {
            name: "Answers in words",
            actual_tool_calls: [],
            expected_tool_calls: [],
          },
        },
        {
          uuid: "i-3",
          payload: { name: "Plain", agent_response: "Hi", output: "Hi" },
        },
      ],
      null,
      type,
    );
    expect(columns.map((c) => c.key)).toEqual(
      expect.arrayContaining(["actual_tool_calls", "expected_tool_calls"]),
    );
    expect(
      rows.map((r) => [r.actual_tool_calls, r.expected_tool_calls]),
    ).toEqual([
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

it("reads the agent's tool calls from actual_tool_calls or a reply-less tool_calls list", () => {
  expect(actualToolCallsCell({ actual_tool_calls: [] })).toBe("[]");
  expect(actualToolCallsCell({ tool_calls: calls })).toBe(
    JSON.stringify(calls),
  );
  expect(actualToolCallsCell({ agent_response: "Hi", tool_calls: calls })).toBe(
    "",
  );
  expect(actualToolCallsCell({})).toBe("");
});

describe("buildItemsCsv for each task type", () => {
  it.each([
    [
      "conversation",
      {
        name: "C",
        description: "d",
        transcript: [{ role: "user", content: "hi" }],
      },
      {
        name: "C",
        description: "d",
        conversation_history: '[{"role":"user","content":"hi"}]',
      },
    ],
    [
      "stt",
      { name: "S", reference_transcript: "ref", predicted_transcript: "pred" },
      { name: "S", reference_transcript: "ref", predicted_transcript: "pred" },
    ],
    [
      "tts",
      { name: "T", text: "say this", audio_path: "a.wav" },
      { name: "T", text: "say this", audio_path: "a.wav" },
    ],
    [
      "llm",
      {
        name: "L",
        chat_history: [{ role: "user", content: "q" }],
        agent_response: "a",
      },
      {
        name: "L",
        description: "",
        conversation_history: '[{"role":"user","content":"q"}]',
        agent_response: "a",
      },
    ],
    [
      "llm-general",
      { name: "G", input: "in", output: "out" },
      { name: "G", description: "", input: "in", output: "out" },
    ],
  ])("writes a %s item's own columns", (type, payload, expected) => {
    const { columns, rows } = buildItemsCsv(
      [{ uuid: "i", payload }],
      null,
      type,
    );
    expect(rows[0]).toEqual(expect.objectContaining(expected));
    for (const key of Object.keys(expected)) {
      expect(columns.map((c) => c.key)).toContain(key);
    }
  });

  it("leaves a missing value blank rather than writing undefined", () => {
    const { rows } = buildItemsCsv(
      [{ uuid: "i", payload: null }],
      null,
      "conversation",
    );
    expect(rows[0]).toEqual({
      name: "",
      description: "",
      conversation_history: "",
    });
    const stt = buildItemsCsv([{ uuid: "i", payload: {} }], null, "stt")
      .rows[0];
    expect(stt).toEqual({
      name: "",
      reference_transcript: "",
      predicted_transcript: "",
    });
    const tts = buildItemsCsv([{ uuid: "i", payload: {} }], null, "tts")
      .rows[0];
    expect(tts).toEqual({ name: "", text: "", audio_path: "" });
    const llm = buildItemsCsv([{ uuid: "i", payload: {} }], null, "llm")
      .rows[0];
    expect(llm.conversation_history).toBe("");
  });
});

describe("buildItemsCsv with the task's answers", () => {
  const summary = {
    task_id: "t",
    task_type: "llm" as const,
    evaluators: [
      {
        uuid: "ev",
        name: "Right tool?",
        output_type: "binary" as const,
        versions: [
          { uuid: "v1", version_number: 1 },
          { uuid: "v2", version_number: 2 },
        ],
      },
      { uuid: "ev-new", name: "Never run", output_type: "rating" as const },
    ],
    annotators: [
      { uuid: "a1", name: "Asha K" },
      { uuid: "a2", name: "Ravi" },
    ],
    rows: [
      {
        item_id: "i",
        payload: null,
        evaluator_id: "ev",
        evaluator_version_id: "v2",
        evaluator_value: true,
        evaluator_value_name: "Correct",
        evaluator_reasoning: "Called it",
        human_agreement: null,
        evaluator_agreement: null,
        annotations: {
          a1: null,
          a2: { value: false, reasoning: "Wrong tool" },
        },
      },
      {
        item_id: "i",
        payload: null,
        evaluator_id: "ev",
        evaluator_version_id: "v1",
        evaluator_value: false,
        evaluator_reasoning: null,
        human_agreement: null,
        evaluator_agreement: null,
        annotations: { a1: { value: true, reasoning: null } },
      },
    ],
    item_comments: { i: { a1: "Check the date" } },
  };

  it("adds one column pair per annotator and per evaluator version, oldest version first, then comments", () => {
    const { columns } = buildItemsCsv([], summary, "llm");
    const headers = columns.map((c) => c.header);
    expect(headers).toEqual(
      expect.arrayContaining([
        "Asha_K_Right_tool/value",
        "Ravi_Right_tool/reasoning",
        "evaluator_Right_tool_v1/value",
        "evaluator_Right_tool_v2/reasoning",
        "evaluator_Never_run_live/value",
        "Asha_K/comment",
      ]),
    );
    expect(headers.indexOf("evaluator_Right_tool_v1/value")).toBeLessThan(
      headers.indexOf("evaluator_Right_tool_v2/value"),
    );
    expect(headers[headers.length - 1]).toBe("Ravi/comment");
  });

  it("fills each annotator's answer from any version, the judge per version, and the comments", () => {
    const { rows } = buildItemsCsv(
      [{ uuid: "i", payload: { name: "Item" } }],
      summary,
      "llm",
    );
    expect(rows[0]).toEqual(
      expect.objectContaining({
        ann_a1_ev_value: true,
        ann_a1_ev_reasoning: "",
        ann_a2_ev_value: false,
        ann_a2_ev_reasoning: "Wrong tool",
        ev_ev_v2_value: "Correct",
        ev_ev_v2_reasoning: "Called it",
        ev_ev_v1_value: false,
        ev_ev_v1_reasoning: "",
        "ev_ev-new_live_value": "",
        ann_a1_comment: "Check the date",
        ann_a2_comment: "",
      }),
    );
  });

  it("names a column 'unnamed' when the name has no usable characters", () => {
    expect(sanitizeCsvName("!!!")).toBe("unnamed");
    expect(sanitizeCsvName(" Asha K ")).toBe("Asha_K");
  });
});
