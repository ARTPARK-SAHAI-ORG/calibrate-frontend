import {
  toolCallPassFail,
  rowTestType,
  isToolCallRow,
  rowTestUuid,
} from "@/lib/testRunSummary";

describe("toolCallPassFail", () => {
  const toolCall = { test_type: "tool_call" } as const;

  it("returns zero passed/total for an empty list", () => {
    expect(toolCallPassFail([])).toEqual({ passed: 0, total: 0 });
  });

  it("skips tests of other kinds, and rows that say nothing of their kind", () => {
    expect(
      toolCallPassFail([
        { passed: true, test_type: "response" },
        { passed: true, test_case: { evaluation: { type: "response" } } },
        { passed: true },
        { passed: true, test_case: null },
      ]),
    ).toEqual({ passed: 0, total: 0 });
  });

  it("skips a tool-call test that produced no answer", () => {
    expect(
      toolCallPassFail([{ ...toolCall, passed: false, unanswered: true }]),
    ).toEqual({ passed: 0, total: 0 });
  });

  it("skips a tool-call test with no verdict yet", () => {
    expect(
      toolCallPassFail([{ ...toolCall, passed: null }, { ...toolCall }]),
    ).toEqual({ passed: 0, total: 0 });
  });

  it("counts passed and failed tool-call tests, read from either field", () => {
    expect(
      toolCallPassFail([
        { ...toolCall, passed: true },
        { passed: false, test_case: { evaluation: { type: "tool_call" } } },
        { ...toolCall, passed: true },
        { passed: true, test_type: "response" },
      ]),
    ).toEqual({ passed: 2, total: 3 });
  });
});

describe("rowTestType", () => {
  it("reads what kind of test the backend says the row ran", () => {
    expect(rowTestType({ test_type: "tool_call" })).toBe("tool_call");
  });

  it("prefers what the backend says over the test's own config", () => {
    expect(
      rowTestType({
        test_type: "general",
        test_case: { evaluation: { type: "response" } },
      }),
    ).toBe("general");
  });

  it("falls back to the test's own config on an older run", () => {
    expect(
      rowTestType({ test_case: { evaluation: { type: "conversation" } } }),
    ).toBe("conversation");
  });

  it("is null when neither says", () => {
    expect(rowTestType({})).toBeNull();
    expect(rowTestType({ test_type: null, test_case: null })).toBeNull();
    expect(rowTestType({ test_case: { evaluation: null } })).toBeNull();
  });
});

describe("isToolCallRow", () => {
  it("is true when the backend says the row ran a tool-call test", () => {
    expect(isToolCallRow({ test_type: "tool_call" })).toBe(true);
  });

  it("is true when only the test's own config says so", () => {
    expect(
      isToolCallRow({ test_case: { evaluation: { type: "tool_call" } } }),
    ).toBe(true);
  });

  it("is false for another kind of test", () => {
    expect(
      isToolCallRow({
        test_type: "response",
        test_case: { evaluation: { type: "tool_call" } },
      }),
    ).toBe(false);
  });

  it("is false when neither says", () => {
    expect(isToolCallRow({})).toBe(false);
  });
});

// Calibrate replaces the id it is sent with the test's name, so `test_case_id`
// holds a name on some runs. `test_uuid` is the test's real id.
describe("rowTestUuid", () => {
  it("uses the test's own id when the row carries one", () => {
    expect(
      rowTestUuid({ test_uuid: "uuid-1", test_case_id: "v4_ex__pruned__p1" }),
    ).toBe("uuid-1");
  });

  it("falls back to test_case_id on a run that stamped no id", () => {
    expect(rowTestUuid({ test_case_id: "case-9" })).toBe("case-9");
    expect(rowTestUuid({ test_uuid: null, test_case_id: "case-9" })).toBe(
      "case-9",
    );
  });

  it("says nothing when the row identifies no test", () => {
    expect(rowTestUuid({})).toBeNull();
    expect(rowTestUuid({ test_uuid: null })).toBeNull();
  });
});
