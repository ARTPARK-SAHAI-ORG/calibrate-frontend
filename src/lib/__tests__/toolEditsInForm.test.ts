import {
  applyToolEditToMessages,
  applyToolEditToSelectedTools,
  mergeExpectedParams,
  mergeFlatParams,
} from "../toolEditsInForm";

const edit = { uuid: "t1", previousName: "old", name: "new" };

it("renames picked tools by uuid, and loaded ones by their old name", () => {
  const tools = [
    { id: "t1", name: "old", isInbuilt: false },
    { id: "old", name: "old", isInbuilt: false },
    { id: "end_call", name: "End conversation", isInbuilt: true },
    { id: "t2", name: "other", isInbuilt: false },
  ];
  const result = applyToolEditToSelectedTools(tools, edit, (t) => ({
    ...t,
    touched: true,
  }));
  expect(result.map((t) => t.name)).toEqual([
    "new",
    "new",
    "End conversation",
    "other",
  ]);
  expect(result.map((t) => "touched" in t)).toEqual([true, true, false, false]);
});

it("renames a tool call and its response, and gives the call the new inputs", () => {
  const messages = [
    { id: "m1", role: "user" },
    {
      id: "c1",
      role: "tool_call",
      toolId: "t1",
      toolName: "old",
      toolParams: [
        { name: "city", value: "Delhi" },
        { name: "gone", value: "x" },
      ],
    },
    {
      id: "r1",
      role: "tool_response",
      linkedToolCallId: "c1",
      toolName: "old",
    },
    { id: "c2", role: "tool_call", toolId: "call-9", toolName: "old" },
    {
      id: "r2",
      role: "tool_response",
      linkedToolCallId: "call-9",
      toolName: "old",
    },
    { id: "c3", role: "tool_call", toolId: "t2", toolName: "other" },
    {
      id: "r3",
      role: "tool_response",
      linkedToolCallId: "c3",
      toolName: "other",
    },
  ];
  const fresh = [
    { name: "city", value: "" },
    { name: "date", value: "" },
  ];
  const result = applyToolEditToMessages(messages, edit, fresh);
  expect(result.map((m) => m.toolName)).toEqual([
    undefined,
    "new",
    "new",
    "new",
    "new",
    "other",
    "other",
  ]);
  expect(result[1].toolParams).toEqual([
    { name: "city", value: "Delhi" },
    { name: "date", value: "" },
  ]);
  expect(result[3].toolParams).toEqual(fresh);
  expect(result[5].toolParams).toBeUndefined();
  // Without new inputs, only the name changes.
  expect(applyToolEditToMessages(messages, edit)[1].toolParams).toEqual(
    messages[1].toolParams,
  );
});

it("keeps typed values only for inputs in the same group", () => {
  expect(
    mergeFlatParams(
      [{ name: "id", value: "7", group: "query" }],
      [
        { name: "id", value: "", group: "query" },
        { name: "id", value: "", group: "body" },
      ],
    ),
  ).toEqual([
    { name: "id", value: "7", group: "query" },
    { name: "id", value: "", group: "body" },
  ]);
});

it("matches an input saved without its group by name", () => {
  expect(
    mergeFlatParams(
      [{ name: "id", value: "7" }],
      [
        { name: "id", value: "", group: "query" },
        { name: "note", value: "", group: "body" },
      ],
    ),
  ).toEqual([
    { name: "id", value: "7", group: "query" },
    { name: "note", value: "", group: "body" },
  ]);
});

describe("mergeExpectedParams", () => {
  type P = {
    name: string;
    required: boolean;
    dataType: string;
    isObject: boolean;
    custom: boolean;
    value: string;
    allowCustomKeys?: boolean;
    properties?: P[];
  };
  const p = (name: string, extra: Partial<P> = {}): P => ({
    name,
    required: false,
    dataType: "string",
    isObject: false,
    custom: false,
    value: "",
    ...extra,
  });
  const prepareNew = (x: P) => ({ ...x, value: "fresh" });

  it("keeps values and hand-added inputs, drops removed ones, adds new required ones", () => {
    const current = [
      p("city", { value: "Delhi" }),
      p("gone", { value: "x" }),
      p("mine", { custom: true, value: "y" }),
    ];
    const schema = [
      p("city", { required: true, dataType: "integer" }),
      p("date", { required: true }),
      p("note"),
    ];
    expect(mergeExpectedParams(current, schema, prepareNew)).toEqual([
      p("city", { value: "Delhi", required: true, dataType: "integer" }),
      p("mine", { custom: true, value: "y" }),
      p("date", { required: true, value: "fresh" }),
    ]);
  });

  it("merges inside an object, and replaces an input that changed kind", () => {
    const current = [
      p("addr", {
        isObject: true,
        allowCustomKeys: true,
        properties: [p("zip", { value: "1" }), p("old")],
      }),
      p("flag", { value: "z" }),
    ];
    const schema = [
      p("addr", {
        isObject: true,
        allowCustomKeys: false,
        properties: [p("zip"), p("street", { required: true })],
      }),
      p("flag", { isObject: true, required: true }),
    ];
    const result = mergeExpectedParams(current, schema, prepareNew);
    expect(result[0].allowCustomKeys).toBe(false);
    expect(result[0].properties).toEqual([
      p("zip", { value: "1" }),
      p("street", { required: true, value: "fresh" }),
    ]);
    expect(result[1]).toEqual(
      p("flag", { isObject: true, required: true, value: "fresh" }),
    );
  });
});
