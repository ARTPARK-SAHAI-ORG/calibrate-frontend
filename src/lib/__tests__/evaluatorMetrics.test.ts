import {
  readProviderEvaluatorMean,
  formatMetricValue,
  formatEvaluatorAggregate,
  formatEvaluatorRowValue,
} from "../evaluatorMetrics";

describe("readProviderEvaluatorMean", () => {
  it("reads mean from evaluator_runs when present", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      {
        evaluator_runs: [
          { metric_key: "correctness", aggregate: { mean: 0.75 } },
        ],
      },
    );
    expect(result).toBe(0.75);
  });

  it("falls back to metrics[scoreField] when no matching run", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      { metrics: { correctness_score: 0.5 } },
    );
    expect(result).toBe(0.5);
  });

  it("uses custom scoreField when provided", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness", scoreField: "custom_score" },
      { metrics: { custom_score: 0.9 } },
    );
    expect(result).toBe(0.9);
  });

  it("falls back to nested metrics[key].mean", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      { metrics: { correctness: { mean: 0.3 } } },
    );
    expect(result).toBe(0.3);
  });

  it("returns undefined when nothing matches", () => {
    const result = readProviderEvaluatorMean({ key: "correctness" }, {});
    expect(result).toBeUndefined();
  });

  it("returns undefined when run exists but aggregate.mean is not a number", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      {
        evaluator_runs: [{ metric_key: "correctness", aggregate: {} }],
      },
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when flat metric is not a number", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      { metrics: { correctness_score: "not a number" } },
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when nested value has no mean field", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      { metrics: { correctness: { total: 5 } } },
    );
    expect(result).toBeUndefined();
  });

  it("returns undefined when nested is not an object", () => {
    const result = readProviderEvaluatorMean(
      { key: "correctness" },
      { metrics: { correctness: "oops" } },
    );
    expect(result).toBeUndefined();
  });
});

describe("formatMetricValue", () => {
  it("formats finite numbers rounded to 4 decimals", () => {
    expect(formatMetricValue(0.123456789)).toBe(0.1235);
  });

  it("returns dash for NaN", () => {
    expect(formatMetricValue(NaN)).toBe("-");
  });

  it("returns dash for non-numbers", () => {
    expect(formatMetricValue("string")).toBe("-");
    expect(formatMetricValue(null)).toBe("-");
    expect(formatMetricValue(undefined)).toBe("-");
  });
});

describe("formatEvaluatorAggregate", () => {
  it("returns dash for non-numeric or non-finite value", () => {
    expect(formatEvaluatorAggregate(null, "binary")).toBe("-");
    expect(formatEvaluatorAggregate(undefined, "rating")).toBe("-");
    expect(formatEvaluatorAggregate(NaN, "binary")).toBe("-");
  });

  it("formats binary as a rounded percentage", () => {
    expect(formatEvaluatorAggregate(0.6, "binary")).toBe("60%");
    expect(formatEvaluatorAggregate(0.666, "binary")).toBe("67%");
  });

  it("formats rating with scaleMax", () => {
    expect(formatEvaluatorAggregate(3.456789, "rating", 5)).toBe("3.4568/5");
  });

  it("formats rating without scaleMax", () => {
    expect(formatEvaluatorAggregate(3.456789, "rating")).toBe("3.4568");
  });

  it("ignores non-finite scaleMax", () => {
    expect(formatEvaluatorAggregate(3, "rating", NaN)).toBe("3");
  });
});

describe("formatEvaluatorRowValue", () => {
  it("returns raw score untouched for binary", () => {
    expect(formatEvaluatorRowValue("Correct", "binary")).toBe("Correct");
  });

  it("returns raw score when not numeric for rating", () => {
    expect(formatEvaluatorRowValue("n/a", "rating")).toBe("n/a");
  });

  it("formats numeric rating score with scaleMax", () => {
    expect(formatEvaluatorRowValue("3.456789", "rating", 5)).toBe("3.4568/5");
  });

  it("formats numeric rating score without scaleMax", () => {
    expect(formatEvaluatorRowValue("3.456789", "rating")).toBe("3.4568");
  });

  it("ignores non-finite scaleMax for rating", () => {
    expect(formatEvaluatorRowValue("3", "rating", NaN)).toBe("3");
  });
});
