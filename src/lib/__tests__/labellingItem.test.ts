import {
  evaluatorsThatCanBeRun,
  isSkippedRunResult,
  runEvaluatorsDecision,
  toItemDetailItem,
} from "../labellingItem";

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
});

describe("runEvaluatorsDecision", () => {
  it("refuses a set of nothing but tool calls", () => {
    expect(
      runEvaluatorsDecision([{ is_tool_call: true }, { is_tool_call: true }]),
    ).toEqual({ blocked: true });
  });

  it("runs a mixed set and counts the tool calls left out", () => {
    expect(
      runEvaluatorsDecision([
        { is_tool_call: true },
        { is_tool_call: false },
        {},
      ]),
    ).toEqual({ blocked: false, toolCallSkipCount: 1 });
  });

  it("runs a set with no tool calls and counts none", () => {
    expect(
      runEvaluatorsDecision([{ is_tool_call: false }, {}]),
    ).toEqual({ blocked: false, toolCallSkipCount: 0 });
  });

  it("does not refuse an empty set", () => {
    expect(runEvaluatorsDecision([])).toEqual({
      blocked: false,
      toolCallSkipCount: 0,
    });
  });
});

describe("isSkippedRunResult", () => {
  it("is true only when the run recorded a skip", () => {
    expect(isSkippedRunResult({ skipped: true })).toBe(true);
    expect(isSkippedRunResult({ skipped: false })).toBe(false);
    expect(isSkippedRunResult({ value: "yes" })).toBe(false);
    expect(isSkippedRunResult(null)).toBe(false);
    expect(isSkippedRunResult(undefined)).toBe(false);
  });
});

describe("evaluatorsThatCanBeRun", () => {
  it("leaves out tool call correctness, which people answer", () => {
    expect(
      evaluatorsThatCanBeRun([
        { uuid: "a", evaluator_type: "llm" },
        { uuid: "b", evaluator_type: "tool-call" },
        { uuid: "c" },
      ]),
    ).toEqual([{ uuid: "a", evaluator_type: "llm" }, { uuid: "c" }]);
  });

  it("returns nothing when tool call correctness is all there is", () => {
    expect(
      evaluatorsThatCanBeRun([{ uuid: "b", evaluator_type: "tool-call" }]),
    ).toEqual([]);
  });
});
