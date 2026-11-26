import { textFieldsToPayload } from "@/components/human-labelling/itemConversation";
import { agentToolCalls, evaluatorFitsItem, payloadItemKind, evaluatorsFittingItems, evaluatorTypesForTask, fitsTaskType, toItemDetailItem, itemEditForm, llmGeneralDialogRow, readEvaluatorVariables, selectedTaskItems, storesEmptyToolCallList } from "../labellingItem";

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

  it("carries metadata through, and leaves it undefined when absent", () => {
    const metadata = [{ key: "source", value: "crm" }];
    expect(toItemDetailItem({ ...base, metadata }).metadata).toEqual(metadata);
    expect(toItemDetailItem(base).metadata).toBeUndefined();
  });
});

describe("evaluatorFitsItem", () => {
  it("pairs tool-call evaluators with tool-call rows, and the others with replies or rows with no tool calls", () => {
    expect(evaluatorFitsItem("tool-call", { is_tool_call: true })).toBe(true);
    expect(evaluatorFitsItem("tool-call", { is_tool_call: false })).toBe(false);
    expect(evaluatorFitsItem("tool-call", { has_reply: true })).toBe(false);
    expect(evaluatorFitsItem("llm", { is_tool_call: true })).toBe(false);
    expect(evaluatorFitsItem("llm", { is_tool_call: false })).toBe(true);
    expect(evaluatorFitsItem(undefined, {})).toBe(true);
    expect(evaluatorFitsItem(undefined, { is_tool_call: true })).toBe(false);
  });

  it("lets both kinds judge a row with a reply and tool calls", () => {
    const both = { is_tool_call: true, has_reply: true };
    expect(evaluatorFitsItem("tool-call", both)).toBe(true);
    expect(evaluatorFitsItem("llm", both)).toBe(true);
  });
});

describe("payloadItemKind", () => {
  it("reads tool calls and a non-blank reply off a payload", () => {
    expect(payloadItemKind({ agent_response: "hi" })).toEqual({ is_tool_call: false, has_reply: true });
    expect(payloadItemKind({ agent_response: "  ", tool_calls: [{ tool: "a" }] })).toEqual({ is_tool_call: true, has_reply: false });
    expect(payloadItemKind({ output: "ok", tool_calls: [{ tool: "a" }] })).toEqual({ is_tool_call: true, has_reply: true });
    expect(payloadItemKind({ expected_tool_calls: [], tool_calls: [] })).toEqual({ is_tool_call: true, has_reply: false });
    expect(payloadItemKind({ tool_calls: [] })).toEqual({ is_tool_call: false, has_reply: false });
  });
});

describe("itemEditForm", () => {
  it.each([
    ["tts", "tts"],
    ["stt", "stt"],
    ["llm-general", "llm-general"],
    ["llm", "chat"],
    ["conversation", "chat"],
  ])("opens a %s item in the %s form", (taskType, form) => {
    expect(itemEditForm(taskType)).toBe(form);
  });
});

// Duplicate once built this row inline and left the tool calls off, so a copy
// of a tool-call item opened with no answer and Save stayed off.
describe("llmGeneralDialogRow", () => {
  it("reads the agent's calls stored under tool_calls", () => {
    const calls = [{ tool: "book_flight", arguments: {} }];
    expect(
      llmGeneralDialogRow({ uuid: "i1", payload: { input: "hi", tool_calls: calls } }).toolCalls,
    ).toEqual(calls);
  });

  it("carries the input's and output's headings and versions", () => {
    const input = { content: "hi", label: "English", versions: { Hindi: "नमस्ते" } };
    const row = llmGeneralDialogRow({
      uuid: "i1",
      payload: { input, output: "hello" },
    });
    expect(row).toMatchObject({
      input: "hi",
      output: "hello",
      inputExtras: { label: "English", versions: { Hindi: "नमस्ते" } },
      outputExtras: {},
    });
    expect(textFieldsToPayload(row)).toEqual({ input, output: "hello" });
  });

  const calls = [{ tool: "lookup", arguments: { id: 7 } }];

  it("carries the item's tool calls", () => {
    const row = llmGeneralDialogRow({
      uuid: "i1",
      payload: {
        name: "A",
        input: "hi",
        output: "",
        actual_tool_calls: calls,
        expected_tool_calls: calls,
      },
    });
    expect(row.toolCalls).toEqual(calls);
    expect(row.expectedToolCalls).toEqual(calls);
    expect(row.output).toBe("");
  });

  it("reads every other field off the payload", () => {
    const metadata = [{ key: "k", value: "v" }];
    expect(
      llmGeneralDialogRow({
        uuid: "i1",
        payload: {
          name: "A",
          description: "d",
          input: { content: "in", label: "English" },
          output: "out",
          evaluator_variables: { ev: { x: "1", n: 2 } },
        },
        metadata,
      }),
    ).toEqual({
      uuid: "i1",
      name: "A",
      description: "d",
      input: "in",
      output: "out",
      inputExtras: { label: "English" },
      outputExtras: {},
      toolCalls: [],
      expectedToolCalls: [],
      varValues: { ev: { x: "1" } },
      metadata,
    });
  });

  it("falls back to empty values for a missing payload", () => {
    expect(llmGeneralDialogRow({ uuid: "i1", payload: null })).toMatchObject({
      name: "",
      description: "",
      input: "",
      output: "",
      toolCalls: [],
      expectedToolCalls: [],
      varValues: {},
    });
  });
});

describe("readEvaluatorVariables", () => {
  it("returns nothing for a missing payload or a malformed value", () => {
    expect(readEvaluatorVariables(null)).toEqual({});
    expect(readEvaluatorVariables({ evaluator_variables: [] })).toEqual({});
  });
});

describe("evaluatorTypesForTask", () => {
  it("adds the tool-call kind to llm and llm-general tasks only", () => {
    expect(evaluatorTypesForTask("llm")).toEqual(["llm", "tool-call"]);
    expect(evaluatorTypesForTask("llm-general")).toEqual([
      "llm-general",
      "tool-call",
    ]);
    expect(evaluatorTypesForTask("conversation")).toEqual(["conversation"]);
    expect(evaluatorTypesForTask("stt")).toEqual(["stt"]);
  });
});

describe("fitsTaskType", () => {
  it("lets a tool-call evaluator onto llm and llm-general tasks", () => {
    expect(fitsTaskType("llm", "llm")).toBe(true);
    expect(fitsTaskType("tool-call", "llm")).toBe(true);
    expect(fitsTaskType("tool-call", "llm-general")).toBe(true);
    expect(fitsTaskType("tool-call", "conversation")).toBe(false);
    expect(fitsTaskType("llm", "llm-general")).toBe(false);
    expect(fitsTaskType(undefined, "llm")).toBe(false);
  });
});

describe("storesEmptyToolCallList", () => {
  it("is true only when an expected or actual tool call list is empty", () => {
    expect(storesEmptyToolCallList({ actual_tool_calls: [] })).toBe(true);
    expect(storesEmptyToolCallList({ expected_tool_calls: [] })).toBe(true);
    expect(storesEmptyToolCallList({ actual_tool_calls: [{ tool: "x" }] })).toBe(false);
    expect(storesEmptyToolCallList({ agent_response: "hi" })).toBe(false);
    expect(storesEmptyToolCallList(null)).toBe(false);
  });
});

describe("agentToolCalls", () => {
  const calls = [{ tool: "a", arguments: {} }];
  it("uses actual_tool_calls whenever it is a list, even an empty one", () => {
    expect(agentToolCalls({ actual_tool_calls: calls, tool_calls: [] })).toEqual(calls);
    expect(agentToolCalls({ actual_tool_calls: [], tool_calls: calls })).toEqual([]);
  });
  it("falls back to tool_calls, and to nothing", () => {
    expect(agentToolCalls({ tool_calls: calls })).toEqual(calls);
    expect(agentToolCalls({ agent_response: "hi", tool_calls: calls })).toEqual(calls);
    expect(agentToolCalls({ tool_calls: "x" })).toEqual([]);
    expect(agentToolCalls({})).toEqual([]);
  });
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

describe("evaluatorsFittingItems", () => {
  const evaluators = [
    { uuid: "reply", evaluator_type: "llm" },
    { uuid: "calls", evaluator_type: "tool-call" },
  ];
  const offered = (items: { is_tool_call?: boolean; has_reply?: boolean }[]) =>
    evaluatorsFittingItems(evaluators, items).map((e) => e.uuid);

  it("offers every evaluator when there are no items", () => {
    expect(offered([])).toEqual(["reply", "calls"]);
  });

  it("offers only the tool call evaluator for tool call items", () => {
    expect(offered([{ is_tool_call: true }])).toEqual(["calls"]);
  });

  it("leaves out the tool call evaluator for other items", () => {
    expect(offered([{ is_tool_call: false }, {}])).toEqual(["reply"]);
  });

  it("offers both when the items are of both kinds", () => {
    expect(offered([{ is_tool_call: true }, {}])).toEqual(["reply", "calls"]);
  });

  it("offers both for one item with a reply and tool calls", () => {
    expect(offered([{ is_tool_call: true, has_reply: true }])).toEqual(["reply", "calls"]);
  });
});
