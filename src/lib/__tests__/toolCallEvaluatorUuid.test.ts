import { toolCallEvaluatorUuidFromRows } from "../testRunSummary";

// Written after getting this wrong once: the first attempt read a kind off
// the run's evaluator list, which does not carry one, so it never found the
// evaluator and a duplicate card stayed on screen.
describe("toolCallEvaluatorUuidFromRows", () => {
  it("finds the evaluator that judged a tool-call test", () => {
    expect(
      toolCallEvaluatorUuidFromRows([
        {
          testCase: { evaluation: { type: "tool_call" } },
          judgeResults: [{ evaluator_uuid: "ev-tool" }],
        },
      ]),
    ).toBe("ev-tool");
  });

  it("ignores the evaluators that judged a response test", () => {
    expect(
      toolCallEvaluatorUuidFromRows([
        {
          testCase: { evaluation: { type: "response" } },
          judgeResults: [{ evaluator_uuid: "ev-reply" }],
        },
        {
          testCase: { evaluation: { type: "tool_call" } },
          judgeResults: [{ evaluator_uuid: "ev-tool" }],
        },
      ]),
    ).toBe("ev-tool");
  });

  it("finds nothing on a run with no tool-call tests", () => {
    expect(
      toolCallEvaluatorUuidFromRows([
        {
          testCase: { evaluation: { type: "response" } },
          judgeResults: [{ evaluator_uuid: "ev-reply" }],
        },
      ]),
    ).toBeNull();
  });

  it("finds nothing on an older run whose tool-call row has no judge result", () => {
    expect(
      toolCallEvaluatorUuidFromRows([
        { testCase: { evaluation: { type: "tool_call" } }, judgeResults: null },
      ]),
    ).toBeNull();
  });

  it("copes with rows that carry neither a test case nor results", () => {
    expect(toolCallEvaluatorUuidFromRows([{}])).toBeNull();
    expect(toolCallEvaluatorUuidFromRows([])).toBeNull();
  });

  it("skips a judge result with no evaluator named on it", () => {
    expect(
      toolCallEvaluatorUuidFromRows([
        {
          testCase: { evaluation: { type: "tool_call" } },
          judgeResults: [{ evaluator_uuid: null }, { evaluator_uuid: "ev-2" }],
        },
      ]),
    ).toBe("ev-2");
  });
});
