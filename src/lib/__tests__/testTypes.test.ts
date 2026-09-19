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
  runStateOf,
  getModelPassRange,
  modelsUnansweredCount,
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

describe("runStateOf", () => {
  it("says a finished run ran every test", () => {
    expect(runStateOf({ status: "done" })).toBe("finished");
    expect(runStateOf({ status: "done", stopped_early: false })).toBe(
      "finished",
    );
  });

  it("says a run gave up when it stopped before starting every test", () => {
    expect(runStateOf({ status: "done", stopped_early: true })).toBe("gave_up");
  });

  it("says a run gave up when a test produced no answer", () => {
    expect(
      runStateOf({ status: "done", total_tests: 3, unanswered_tests: 1 }),
    ).toBe("gave_up");
    expect(
      runStateOf({ status: "done", total_tests: 3, unanswered_tests: 0 }),
    ).toBe("finished");
  });

  it("says when none of the tests could be run", () => {
    expect(
      runStateOf({ status: "done", total_tests: 1, unanswered_tests: 1 }),
    ).toBe("none_run");
    // With no size to read the count against, "some could not be run" is true
    // either way, while "none of them ran" can be flatly wrong: a comparison
    // row carries no total of its own, so two unanswered tests out of 470
    // would otherwise read as a run that did nothing.
    expect(runStateOf({ status: "done", unanswered_tests: 2 })).toBe("gave_up");
  });

  it("lets stopped and broken win over gave up", () => {
    expect(
      runStateOf({ status: "done", aborted: true, stopped_early: true }),
    ).toBe("stopped");
    expect(runStateOf({ status: "failed", stopped_early: true })).toBe("error");
  });

  it("says nothing while the run is still going", () => {
    expect(runStateOf({ status: "in_progress", stopped_early: true })).toBe(
      null,
    );
  });
});

describe("getModelPassRange", () => {
  it("gives the spread of what the models passed", () => {
    expect(
      getModelPassRange([
        { model: "a", total_tests: 100, passed: 88, failed: 12 },
        { model: "b", total_tests: 100, passed: 96, failed: 4 },
        { model: "c", total_tests: 100, passed: 90, failed: 10 },
      ] as never),
    ).toEqual({ lowest: 88, highest: 96, failedModels: 0 });
  });

  it("gives one number when every model passed the same share", () => {
    const range = getModelPassRange([
      { total_tests: 50, passed: 47, failed: 3 },
      { total_tests: 100, passed: 94, failed: 6 },
    ]);
    expect(range?.lowest).toBe(94);
    expect(range?.highest).toBe(94);
  });

  it("counts the models that could not be run and leaves them out of the spread", () => {
    expect(
      getModelPassRange([
        { total_tests: 10, passed: 5, failed: 5 },
        { success: false, total_tests: 10, passed: 0, failed: 0 },
      ]),
    ).toEqual({ lowest: 50, highest: 50, failedModels: 1 });
  });

  it("still reports the failed models when no model carries counts", () => {
    expect(getModelPassRange([{ success: false }])).toEqual({
      lowest: null,
      highest: null,
      failedModels: 1,
    });
  });

  it("says nothing when there are no counts and nothing failed", () => {
    expect(getModelPassRange([{ model: "a" } as never])).toBeNull();
    expect(getModelPassRange(null)).toBeNull();
    expect(getModelPassRange([{ total_tests: 0, passed: 0, failed: 0 }])).toBeNull();
    // A model that ran nothing is still listed with every test it was given.
    expect(getModelPassRange([{ total_tests: 20, passed: 0 }])).toBeNull();
  });
});

describe("runStateOf and tests that never ran", () => {
  it("does not call a run finished when a test produced no answer", () => {
    expect(
      runStateOf({ status: "done", total_tests: 3, unanswered_tests: 1 }),
    ).toBe("gave_up");
    expect(
      runStateOf({ status: "done", total_tests: 3, unanswered_tests: 0 }),
    ).toBe("finished");
    // Every test in it: that reads as none of them having run, not as some.
    expect(
      runStateOf({ status: "done", total_tests: 3, unanswered_tests: 3 }),
    ).toBe("none_run");
  });

  it("reads the same off a comparison's models", () => {
    expect(
      runStateOf({
        status: "done",
        model_results: [{ total_tests: 10, passed: 4, failed: 3 }],
      }),
    ).toBe("gave_up");
    expect(
      runStateOf({
        status: "done",
        model_results: [{ total_tests: 10, passed: 6, failed: 4 }],
      }),
    ).toBe("finished");
  });

  it("leaves a model that does not say how it did out of it", () => {
    // Every model is listed with the tests it was given, answered or not, so
    // a count of its own is the only thing that says any were skipped.
    expect(
      runStateOf({ status: "done", model_results: [{ total_tests: 10 }] }),
    ).toBe("finished");
  });
});

describe("a run that broke and was also stopped", () => {
  it("says it broke, since that is what the reader has to act on", () => {
    expect(runStateOf({ status: "failed", aborted: true })).toBe("error");
  });
});

describe("a model that could not be run at all", () => {
  it("means the run did not run everything", () => {
    expect(
      runStateOf({ status: "done", model_results: [{ success: false }] }),
    ).toBe("gave_up");
  });
});

describe("modelsUnansweredCount", () => {
  it("counts tests, not tests times models", () => {
    // Two models of 10 tests each: one left 2 untouched, the other 4. The run
    // is still 10 tests, so the answer is 4, never 6.
    expect(
      modelsUnansweredCount([
        { total_tests: 10, passed: 5, failed: 3 },
        { total_tests: 10, passed: 4, failed: 2 },
      ]),
    ).toBe(4);
  });

  it("leaves a model that could not be run to the models count", () => {
    // The cell says "1 model failed" beside this, so counting its tests here
    // as well would say the same thing twice.
    expect(modelsUnansweredCount([{ total_tests: 10, success: false }])).toBe(0);
  });

  it("counts the tests that produced no answer, not only the ones never reached", () => {
    // A model that finished carries `failed = total - passed`, so its two
    // unanswered tests are inside that 5 until they are taken back out.
    expect(
      modelsUnansweredCount([
        { total_tests: 10, passed: 5, failed: 5, unanswered_tests: 2 },
      ]),
    ).toBe(2);
  });

  it("is zero when the models answered everything or say nothing", () => {
    expect(
      modelsUnansweredCount([{ total_tests: 10, passed: 6, failed: 4 }]),
    ).toBe(0);
    expect(modelsUnansweredCount([{ total_tests: 10 }])).toBe(0);
    expect(modelsUnansweredCount(null)).toBe(0);
  });
});

describe("a comparison where some tests produced no answer", () => {
  it("scores the model on what it answered, not on what it was given", () => {
    // The backend gives a finished model failed = total - passed, so without
    // taking the unanswered tests out this would read 50% instead of 100%.
    expect(
      getModelPassRange([
        { total_tests: 10, passed: 5, failed: 5, unanswered_tests: 5 },
      ]),
    ).toEqual({ lowest: 100, highest: 100, failedModels: 0 });
  });
});
