import {
  toolCallPassFail,
  buildEvaluatorSummaryFromResults,
} from "@/lib/testRunSummary";
import type { JudgeResult, TestRunEvaluator } from "@/components/test-results/shared";

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
