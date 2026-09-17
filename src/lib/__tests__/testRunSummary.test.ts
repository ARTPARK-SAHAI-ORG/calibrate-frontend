import {
  toolCallPassFail,
  buildEvaluatorSummaryFromResults,
  runEvaluatorSummary,
  rowTestType,
  isToolCallRow,
  rowTestUuid,
} from "@/lib/testRunSummary";
import type { JudgeResult, TestRunEvaluator } from "@/components/test-results/shared";
import type {
  BenchmarkEvaluatorSummaryBinary,
  BenchmarkEvaluatorSummaryRating,
} from "@/lib/benchmarkEvaluatorSummary";

describe("toolCallPassFail", () => {
  it("returns zero passed/total for an empty list", () => {
    expect(toolCallPassFail([])).toEqual({ passed: 0, total: 0 });
  });

  it("ignores non-tool-call rows", () => {
    const rows = [
      { toolCall: false, passed: true, failed: false },
      { toolCall: false, passed: false, failed: true },
    ];
    expect(toolCallPassFail(rows)).toEqual({ passed: 0, total: 0 });
  });

  it("counts passed tool-call rows toward passed and total", () => {
    const rows = [
      { toolCall: true, passed: true, failed: false },
      { toolCall: true, passed: true, failed: false },
    ];
    expect(toolCallPassFail(rows)).toEqual({ passed: 2, total: 2 });
  });

  it("counts failed tool-call rows toward total only", () => {
    const rows = [
      { toolCall: true, passed: false, failed: true },
      { toolCall: true, passed: true, failed: false },
    ];
    expect(toolCallPassFail(rows)).toEqual({ passed: 1, total: 2 });
  });

  it("excludes tool-call rows that are neither passed nor failed (running/error)", () => {
    const rows = [
      { toolCall: true, passed: false, failed: false },
      { toolCall: true, passed: true, failed: false },
    ];
    expect(toolCallPassFail(rows)).toEqual({ passed: 1, total: 1 });
  });

  it("mixes tool-call and non-tool-call rows correctly", () => {
    const rows = [
      { toolCall: true, passed: true, failed: false },
      { toolCall: false, passed: true, failed: false },
      { toolCall: true, passed: false, failed: true },
      { toolCall: false, passed: false, failed: true },
    ];
    expect(toolCallPassFail(rows)).toEqual({ passed: 1, total: 2 });
  });
});

describe("buildEvaluatorSummaryFromResults", () => {
  const binaryEvaluator: TestRunEvaluator = {
    uuid: "eval-binary",
    name: "Correctness",
    description: "Checks correctness",
    output_type: "binary",
  };

  const ratingEvaluator: TestRunEvaluator = {
    uuid: "eval-rating",
    name: "Helpfulness",
    description: null,
    output_type: "rating",
    scale_min: 1,
    scale_max: 5,
  };

  it("returns an empty array when no row carries judge_results", () => {
    expect(buildEvaluatorSummaryFromResults([{}, {}], {})).toEqual([]);
  });

  it("returns an empty array when judge_results is null", () => {
    expect(
      buildEvaluatorSummaryFromResults([{ judge_results: null }], {}),
    ).toEqual([]);
  });

  it("skips judge results without an evaluator_uuid", () => {
    const results = [
      { judge_results: [{ match: true } as JudgeResult] },
    ];
    expect(buildEvaluatorSummaryFromResults(results, {})).toEqual([]);
  });

  it("aggregates binary evaluator pass rate", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-binary", match: true }] },
      { judge_results: [{ evaluator_uuid: "eval-binary", match: false }] },
      { judge_results: [{ evaluator_uuid: "eval-binary", match: true }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-binary": binaryEvaluator,
    });
    expect(out).toEqual([
      {
        metric_key: "eval-binary",
        name: "Correctness",
        description: "Checks correctness",
        evaluator_uuid: "eval-binary",
        type: "binary",
        passed: 2,
        total: 3,
        pass_rate: (2 / 3) * 100,
      },
    ]);
  });

  it("aggregates rating evaluator mean/min/max", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-rating", score: 2 }] },
      { judge_results: [{ evaluator_uuid: "eval-rating", score: 4 }] },
      { judge_results: [{ evaluator_uuid: "eval-rating", score: 5 }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-rating": ratingEvaluator,
    });
    expect(out).toEqual([
      {
        metric_key: "eval-rating",
        name: "Helpfulness",
        description: null,
        evaluator_uuid: "eval-rating",
        type: "rating",
        mean: (2 + 4 + 5) / 3,
        min: 2,
        max: 5,
        count: 3,
        scale_min: 1,
        scale_max: 5,
      },
    ]);
  });

  it("uses NaN scale_min/scale_max when the evaluator lacks them", () => {
    const noScaleEvaluator: TestRunEvaluator = {
      uuid: "eval-rating-2",
      name: "Clarity",
      output_type: "rating",
    };
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-rating-2", score: 3 }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-rating-2": noScaleEvaluator,
    });
    expect(out).toHaveLength(1);
    expect(Number.isNaN(out[0].scale_min as number)).toBe(true);
    expect(Number.isNaN(out[0].scale_max as number)).toBe(true);
  });

  it("treats legacy rows without output_type but with numeric scores as rating", () => {
    const legacyEvaluator: TestRunEvaluator = {
      uuid: "eval-legacy",
      name: "Legacy",
      output_type: undefined as unknown as "binary" | "rating",
    };
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-legacy", score: 3 }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-legacy": legacyEvaluator,
    });
    expect(out[0].type).toBe("rating");
  });

  it("skips rating evaluator entries when there are no numeric scores", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-rating", score: null }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-rating": ratingEvaluator,
    });
    expect(out).toEqual([]);
  });

  it("skips binary evaluator entries when there are no boolean matches", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-binary", match: null }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-binary": binaryEvaluator,
    });
    expect(out).toEqual([]);
  });

  it("filters out non-finite scores from rating aggregation", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "eval-rating", score: NaN }] },
      { judge_results: [{ evaluator_uuid: "eval-rating", score: 4 }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-rating": ratingEvaluator,
    });
    expect(out[0]).toMatchObject({ mean: 4, count: 1 });
  });

  it("preserves first-seen evaluator order across multiple evaluators", () => {
    const results = [
      {
        judge_results: [
          { evaluator_uuid: "eval-rating", score: 3 },
          { evaluator_uuid: "eval-binary", match: true },
        ],
      },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-binary": binaryEvaluator,
      "eval-rating": ratingEvaluator,
    });
    expect(out.map((e) => e.evaluator_uuid)).toEqual([
      "eval-rating",
      "eval-binary",
    ]);
  });

  it("handles an evaluator missing from evaluatorsByUuid (undefined name/description)", () => {
    const results = [
      { judge_results: [{ evaluator_uuid: "unknown-uuid", match: true }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {});
    expect(out).toEqual([
      {
        metric_key: "unknown-uuid",
        name: undefined,
        description: null,
        evaluator_uuid: "unknown-uuid",
        type: "binary",
        passed: 1,
        total: 1,
        pass_rate: 100,
      },
    ]);
  });

  it("ignores results whose judge_results is not an array", () => {
    const results = [
      { judge_results: undefined },
      { judge_results: [{ evaluator_uuid: "eval-binary", match: true }] },
    ];
    const out = buildEvaluatorSummaryFromResults(results, {
      "eval-binary": binaryEvaluator,
    });
    expect(out).toHaveLength(1);
  });
});

describe("runEvaluatorSummary", () => {
  const binary: BenchmarkEvaluatorSummaryBinary = {
    metric_key: "eval-binary",
    name: "Correctness",
    description: null,
    evaluator_uuid: "eval-binary",
    type: "binary",
    passed: 2,
    total: 3,
    // Already out of 100, the same as a benchmark's.
    pass_rate: 67,
  };

  const rating: BenchmarkEvaluatorSummaryRating = {
    metric_key: "eval-rating",
    name: "Helpfulness",
    description: null,
    evaluator_uuid: "eval-rating",
    type: "rating",
    mean: 4.2,
    min: 1,
    max: 5,
    count: 10,
    scale_min: 1,
    scale_max: 5,
  };

  it("returns an empty list when the run carries no totals", () => {
    expect(runEvaluatorSummary(null)).toEqual([]);
    expect(runEvaluatorSummary(undefined)).toEqual([]);
    expect(
      runEvaluatorSummary(
        {} as unknown as BenchmarkEvaluatorSummaryBinary[],
      ),
    ).toEqual([]);
  });

  it("returns an empty list for an empty set of totals", () => {
    expect(runEvaluatorSummary([])).toEqual([]);
  });

  it("hands back a pass rate exactly as the backend counted it", () => {
    expect(runEvaluatorSummary([binary])).toEqual([binary]);
    // 67 is already the number the cards draw. Anything that multiplies it
    // again fails here.
    expect((runEvaluatorSummary([binary])[0] as typeof binary).pass_rate).toBe(
      67,
    );
  });

  it("leaves a rating untouched", () => {
    expect(runEvaluatorSummary([rating])).toEqual([rating]);
  });

  it("hands back both kinds together, in the order they came", () => {
    expect(runEvaluatorSummary([rating, binary])).toEqual([rating, binary]);
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
