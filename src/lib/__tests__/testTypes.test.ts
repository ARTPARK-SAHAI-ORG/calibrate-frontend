import {
  testTypeLabel,
  isUnanswered,
  type TestRowLike,
  getRunBreakdown,
  modelComparisonName,
  runDisplayName,
  isRunStopped,
  isNotRun,
  isRunInProgress,
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

  it("leaves a typed name that starts with Benchmark alone", () => {
    expect(modelComparisonName("Benchmark before v2")).toBe(
      "Benchmark before v2",
    );
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

  it("leaves a typed name alone, including one that starts with Run", () => {
    expect(runDisplayName("llm-unit-test", "Regression before v2")).toBe(
      "Regression before v2",
    );
    expect(runDisplayName("llm-unit-test", "Run before the fix")).toBe(
      "Run before the fix",
    );
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

describe("isNotRun", () => {
  it("reads the backend's own flag", () => {
    expect(isNotRun({ not_run: true }, false)).toBe(true);
  });

  it("counts a test with no verdict on a stopped run as never run", () => {
    // The run is finished, so nothing more is coming for that test.
    expect(isNotRun({ passed: null }, true)).toBe(true);
    expect(isNotRun({}, true)).toBe(true);
  });

  it("leaves a test with no verdict alone while the run is still going", () => {
    expect(isNotRun({ passed: null }, false)).toBe(false);
  });

  it("does not touch a test that answered, stopped run or not", () => {
    expect(isNotRun({ passed: false }, true)).toBe(false);
    expect(isNotRun({ passed: true }, true)).toBe(false);
  });
});

describe("getRunBreakdown on a stopped run", () => {
  it("counts the tests it never started as not run, never as failures", () => {
    // 10 tests linked, stopped after 3 passed and 1 failed.
    expect(
      getRunBreakdown({
        total_tests: 10,
        passed: 3,
        failed: 1,
        aborted: true,
      }),
    ).toEqual({ passed: 3, failed: 1, unanswered: 6 });
  });

  it("counts every test as not run when the run says nothing yet", () => {
    expect(
      getRunBreakdown({
        total_tests: 10,
        passed: null,
        failed: null,
        aborted: true,
      }),
    ).toEqual({ passed: 0, failed: 0, unanswered: 10 });
  });

  it("still works failures out from the total on a run that was not stopped", () => {
    expect(
      getRunBreakdown({ total_tests: 10, passed: 3, unanswered_tests: 1 }),
    ).toEqual({ passed: 3, failed: 6, unanswered: 1 });
  });
});

// Both run lists refresh themselves only while this says a run is still
// going, so a wrong answer here either leaves a finished list refreshing
// forever or leaves a running one frozen.
describe("isRunInProgress", () => {
  it.each(["pending", "queued", "in_progress"])(
    "says a run is still going when its status is %s",
    (status) => {
      expect(isRunInProgress({ status })).toBe(true);
    },
  );

  it.each(["completed", "done", "failed", "aborted", ""])(
    "says a run is not going when its status is %s",
    (status) => {
      expect(isRunInProgress({ status })).toBe(false);
    },
  );
});
