import {
  testTypeLabel,
  isUnanswered,
  type TestRowLike,
  getRunBreakdown,
  modelComparisonName,
  runDisplayName,
  isRunStopped,
} from "../testTypes";

describe("testTypeLabel", () => {
  it("labels tool_call", () => {
    expect(testTypeLabel("tool_call")).toBe("Tool Call");
  });

  it("labels conversation", () => {
    expect(testTypeLabel("conversation")).toBe("Conversation");
  });

  it("labels response", () => {
    expect(testTypeLabel("response")).toBe("Agent Response");
  });

  it("labels general the same as response", () => {
    expect(testTypeLabel("general")).toBe("Agent Response");
  });

  it("uses default fallback for unknown type", () => {
    expect(testTypeLabel("mystery")).toBe("Agent Response");
  });

  it("uses default fallback for null/undefined", () => {
    expect(testTypeLabel(null)).toBe("Agent Response");
    expect(testTypeLabel(undefined)).toBe("Agent Response");
  });

  it("uses custom fallback when provided", () => {
    expect(testTypeLabel("mystery", "—")).toBe("—");
    expect(testTypeLabel(undefined, "—")).toBe("—");
  });
});

describe("isUnanswered", () => {
  it("is true only when the backend says the test produced no answer", () => {
    expect(isUnanswered({ unanswered: true })).toBe(true);
    expect(isUnanswered({ unanswered: false })).toBe(false);
    expect(isUnanswered({})).toBe(false);
    expect(isUnanswered({ unanswered: null })).toBe(false);
  });

  it("does not read a failed verdict as a test that never answered", () => {
    // The whole point of the flag: from calibrate 0.0.74 a test that produced
    // no answer comes back as `passed: false`, exactly like a wrong answer.
    expect(isUnanswered({ passed: false } as TestRowLike)).toBe(false);
  });

  it("does not read a missing verdict as a test that never answered", () => {
    // This was the old rule, and it is the bug this flag exists to correct: no
    // verdict now means only that the test has not finished.
    expect(isUnanswered({ passed: null } as TestRowLike)).toBe(false);
    expect(isUnanswered({ passed: undefined } as TestRowLike)).toBe(false);
  });
});

describe("getRunBreakdown", () => {
  it("returns null when the run reports no tests", () => {
    expect(getRunBreakdown({})).toBeNull();
    expect(getRunBreakdown({ total_tests: 0 })).toBeNull();
    expect(getRunBreakdown({ total_tests: null })).toBeNull();
  });

  it("splits the run into passed, wrong answers, and tests that never ran", () => {
    expect(
      getRunBreakdown({ total_tests: 10, passed: 6, unanswered_tests: 3 }),
    ).toEqual({ passed: 6, failed: 1, unanswered: 3 });
  });

  it("treats a run with no unanswered count as having none", () => {
    expect(getRunBreakdown({ total_tests: 4, passed: 3 })).toEqual({
      passed: 3,
      failed: 1,
      unanswered: 0,
    });
  });

  it("never reports a negative number of wrong answers", () => {
    expect(
      getRunBreakdown({ total_tests: 2, passed: 2, unanswered_tests: 1 }),
    ).toEqual({ passed: 2, failed: 0, unanswered: 1 });
  });
});

describe("modelComparisonName", () => {
  it("calls a backend-named benchmark a model comparison, keeping its number", () => {
    expect(modelComparisonName("Benchmark 3")).toBe("Model comparison 3");
  });

  it("names an unnamed run when the backend has not sent one yet", () => {
    expect(modelComparisonName(null)).toBe("Model comparison");
    expect(modelComparisonName("  ")).toBe("Model comparison");
  });

  it("leaves a name of its own alone", () => {
    expect(modelComparisonName("Nightly sweep")).toBe("Nightly sweep");
  });
});

describe("runDisplayName", () => {
  it("calls a plain run an evaluation run, keeping its number", () => {
    expect(runDisplayName("llm-unit-test", "Run 12")).toBe("Evaluation run 12");
  });

  it("calls a multi-model run a model comparison", () => {
    expect(runDisplayName("llm-benchmark", "Benchmark 3")).toBe(
      "Model comparison 3",
    );
  });

  it("names a run the backend has not named yet", () => {
    expect(runDisplayName("llm-unit-test", "")).toBe("Evaluation run");
    expect(runDisplayName("llm-benchmark", null)).toBe("Model comparison");
  });
});

describe("isRunStopped", () => {
  it("is true only when the backend says the run was stopped", () => {
    expect(isRunStopped({ status: "done", aborted: true })).toBe(true);
  });

  it("is false for a run that finished on its own", () => {
    expect(isRunStopped({ status: "done" })).toBe(false);
    expect(isRunStopped({ status: "done", aborted: false })).toBe(false);
    expect(isRunStopped({ status: "done", aborted: null })).toBe(false);
  });

  it("does not read a failed run as a stopped one", () => {
    expect(isRunStopped({ status: "failed" })).toBe(false);
  });
});
