import {
  formatEvaluatorResultStat,
  summariseValues,
} from "@/lib/evaluatorResultStat";

describe("formatEvaluatorResultStat", () => {
  it("shows the share of items a binary evaluator marked true", () => {
    const stat = formatEvaluatorResultStat(
      { count: 10, trueCount: 8 },
      { output_type: "binary" },
    );
    expect(stat).toEqual({
      label: "Score",
      value: "80%",
      title: "Correct on 8 of 10 items",
      ratio: 0.8,
    });
  });

  it("uses the evaluator's own word for a true verdict in the hover text", () => {
    const stat = formatEvaluatorResultStat(
      { count: 1, trueCount: 1 },
      {
        output_type: "binary",
        output_config: {
          scale: [
            { value: true, name: "Pass" },
            { value: false, name: "Fail" },
          ],
        },
      },
    );
    expect(stat?.title).toBe("Pass on 1 of 1 item");
  });

  it("shows the mean score against the scale for a rating evaluator", () => {
    const stat = formatEvaluatorResultStat(
      { count: 4, mean: 3.75 },
      { output_type: "rating", scale_min: 1, scale_max: 5 },
    );
    expect(stat?.value).toBe("3.75 / 5");
    expect(stat?.title).toBe("Average across 4 items");
    expect(stat?.ratio).toBeCloseTo((3.75 - 1) / 4);
  });

  it("leaves a rating value uncoloured when the scale max is unknown", () => {
    const stat = formatEvaluatorResultStat(
      { count: 2, mean: 3 },
      { output_type: "rating" },
    );
    expect(stat?.value).toBe("3");
    expect(stat?.ratio).toBeNull();
  });

  it("returns nothing when the evaluator produced no values", () => {
    expect(
      formatEvaluatorResultStat({ count: 0, trueCount: 0 }, {
        output_type: "binary",
      }),
    ).toBeNull();
    expect(formatEvaluatorResultStat(null, { output_type: "binary" })).toBeNull();
  });

  it("returns nothing when the count is there but the matching value is not", () => {
    // A rating evaluator with no mean, or a binary one with no true count,
    // cannot be turned into a number.
    expect(
      formatEvaluatorResultStat({ count: 3, mean: null }, {
        output_type: "rating",
      }),
    ).toBeNull();
    expect(
      formatEvaluatorResultStat({ count: 3, trueCount: null }, {
        output_type: "binary",
      }),
    ).toBeNull();
  });

  it("treats an unknown output type as binary", () => {
    const stat = formatEvaluatorResultStat({ count: 4, trueCount: 1 }, null);
    expect(stat?.value).toBe("25%");
  });
});

describe("summariseValues", () => {
  it("shows the share of true values for a yes/no evaluator", () => {
    const stat = summariseValues([true, true, false, true], {
      output_type: "binary",
    });
    expect(stat?.value).toBe("75%");
    expect(stat?.title).toBe("Correct on 3 of 4 items");
    expect(stat?.ratio).toBeCloseTo(0.75);
  });

  it("averages the numbers for a rating evaluator", () => {
    const stat = summariseValues([2, 4, 3], {
      output_type: "rating",
      scale_min: 1,
      scale_max: 5,
    });
    expect(stat?.value).toBe("3 / 5");
    expect(stat?.title).toBe("Average across 3 items");
    expect(stat?.ratio).toBeCloseTo(0.5);
  });

  it("leaves out values of the wrong shape", () => {
    const binary = summariseValues([true, 4, null, undefined, false], {
      output_type: "binary",
    });
    expect(binary?.title).toBe("Correct on 1 of 2 items");

    const rating = summariseValues([true, 4, null, undefined, 2], {
      output_type: "rating",
      scale_min: 1,
      scale_max: 5,
    });
    expect(rating?.value).toBe("3 / 5");
    expect(rating?.title).toBe("Average across 2 items");
  });

  it("returns nothing for an empty list or a list with nothing usable", () => {
    expect(summariseValues([], { output_type: "binary" })).toBeNull();
    expect(summariseValues([], { output_type: "rating" })).toBeNull();
    expect(
      summariseValues([null, undefined, 3], { output_type: "binary" }),
    ).toBeNull();
    expect(
      summariseValues([null, undefined, true], { output_type: "rating" }),
    ).toBeNull();
  });
});
