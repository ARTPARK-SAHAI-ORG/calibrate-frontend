import {
  benchmarkToolCallPassFail,
  benchmarkRatingEvaluatorCaption,
  benchmarkEvaluatorColumnKey,
  benchmarkMetricKeyOrder,
  benchmarkCanonicalModelId,
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkModelLike,
  type BenchmarkLeaderboardSummaryRow,
} from "../benchmarkEvaluatorSummary";

describe("benchmarkToolCallPassFail", () => {
  it("returns zero passed/total when test_results is missing", () => {
    expect(benchmarkToolCallPassFail({ model: "m" })).toEqual({
      passed: 0,
      total: 0,
    });
  });

  it("returns zero when test_results is null", () => {
    expect(
      benchmarkToolCallPassFail({ model: "m", test_results: null }),
    ).toEqual({ passed: 0, total: 0 });
  });

  it("skips non tool_call tests", () => {
    const model: BenchmarkModelLike = {
      model: "m",
      test_results: [
        { passed: true, test_case: { evaluation: { type: "response" } } },
      ],
    };
    expect(benchmarkToolCallPassFail(model)).toEqual({ passed: 0, total: 0 });
  });

  it("skips tool_call tests with an error", () => {
    const model: BenchmarkModelLike = {
      model: "m",
      test_results: [
        {
          passed: true,
          error: "boom",
          test_case: { evaluation: { type: "tool_call" } },
        },
      ],
    };
    expect(benchmarkToolCallPassFail(model)).toEqual({ passed: 0, total: 0 });
  });

  it("skips tool_call tests with null/undefined passed (still running)", () => {
    const model: BenchmarkModelLike = {
      model: "m",
      test_results: [
        { passed: null, test_case: { evaluation: { type: "tool_call" } } },
        { test_case: { evaluation: { type: "tool_call" } } },
      ],
    };
    expect(benchmarkToolCallPassFail(model)).toEqual({ passed: 0, total: 0 });
  });

  it("counts passed and failed tool_call tests", () => {
    const model: BenchmarkModelLike = {
      model: "m",
      test_results: [
        { passed: true, test_case: { evaluation: { type: "tool_call" } } },
        { passed: false, test_case: { evaluation: { type: "tool_call" } } },
        { passed: true, test_case: { evaluation: { type: "tool_call" } } },
        { passed: true, test_case: { evaluation: { type: "response" } } },
      ],
    };
    expect(benchmarkToolCallPassFail(model)).toEqual({ passed: 2, total: 3 });
  });

  it("handles missing test_case/evaluation gracefully", () => {
    const model: BenchmarkModelLike = {
      model: "m",
      test_results: [{ passed: true }, { passed: true, test_case: null }],
    };
    expect(benchmarkToolCallPassFail(model)).toEqual({ passed: 0, total: 0 });
  });
});

describe("benchmarkRatingEvaluatorCaption", () => {
  it("appends the scale range when both bounds are finite", () => {
    expect(benchmarkRatingEvaluatorCaption("Coherence", 1, 5)).toBe(
      "Coherence (1–5)",
    );
  });

  it("returns the bare label when scale_min is missing", () => {
    expect(benchmarkRatingEvaluatorCaption("Coherence", undefined, 5)).toBe(
      "Coherence",
    );
  });

  it("returns the bare label when scale_max is missing", () => {
    expect(benchmarkRatingEvaluatorCaption("Coherence", 1, undefined)).toBe(
      "Coherence",
    );
  });

  it("returns the bare label when both bounds are non-finite", () => {
    expect(
      benchmarkRatingEvaluatorCaption("Coherence", NaN, Infinity),
    ).toBe("Coherence");
  });
});

describe("benchmarkEvaluatorColumnKey", () => {
  it("prefixes a sanitized key with ev_", () => {
    expect(benchmarkEvaluatorColumnKey("Politeness Score")).toBe(
      "ev_Politeness_Score",
    );
  });

  it("collapses runs of non-alphanumeric characters", () => {
    expect(benchmarkEvaluatorColumnKey("a--b__c")).toBe("ev_a_b_c");
  });

  it("strips leading and trailing underscores", () => {
    expect(benchmarkEvaluatorColumnKey("__abc__")).toBe("ev_abc");
  });

  it("falls back to 'metric' when the key sanitizes to empty", () => {
    expect(benchmarkEvaluatorColumnKey("###")).toBe("ev_metric");
  });
});

describe("benchmarkMetricKeyOrder", () => {
  it("returns an empty array for no models", () => {
    expect(benchmarkMetricKeyOrder([])).toEqual([]);
  });

  it("collects first-seen order across models, deduping", () => {
    const models: BenchmarkModelLike[] = [
      {
        model: "m1",
        evaluator_summary: [
          {
            metric_key: "a",
            type: "binary",
            passed: 1,
            total: 2,
            pass_rate: 50,
          },
          {
            metric_key: "b",
            type: "binary",
            passed: 1,
            total: 2,
            pass_rate: 50,
          },
        ],
      },
      {
        model: "m2",
        evaluator_summary: [
          {
            metric_key: "b",
            type: "binary",
            passed: 1,
            total: 2,
            pass_rate: 50,
          },
          {
            metric_key: "c",
            type: "binary",
            passed: 1,
            total: 2,
            pass_rate: 50,
          },
        ],
      },
    ];
    expect(benchmarkMetricKeyOrder(models)).toEqual(["a", "b", "c"]);
  });

  it("handles a model with no evaluator_summary", () => {
    expect(benchmarkMetricKeyOrder([{ model: "m1" }])).toEqual([]);
  });

  it("handles a model with null evaluator_summary", () => {
    expect(
      benchmarkMetricKeyOrder([{ model: "m1", evaluator_summary: null }]),
    ).toEqual([]);
  });
});

describe("benchmarkCanonicalModelId", () => {
  it("returns the exact match when present", () => {
    const modelResults: BenchmarkModelLike[] = [{ model: "gpt-4.1" }];
    expect(benchmarkCanonicalModelId("gpt-4.1", modelResults)).toBe(
      "gpt-4.1",
    );
  });

  it("resolves a single suffix match when raw has no slash", () => {
    const modelResults: BenchmarkModelLike[] = [
      { model: "openai/gpt-4.1" },
    ];
    expect(benchmarkCanonicalModelId("gpt-4.1", modelResults)).toBe(
      "openai/gpt-4.1",
    );
  });

  it("returns raw unchanged when multiple suffix matches exist", () => {
    const modelResults: BenchmarkModelLike[] = [
      { model: "openai/gpt-4.1" },
      { model: "azure/gpt-4.1" },
    ];
    expect(benchmarkCanonicalModelId("gpt-4.1", modelResults)).toBe(
      "gpt-4.1",
    );
  });

  it("returns raw unchanged when raw already contains a slash and no exact match", () => {
    const modelResults: BenchmarkModelLike[] = [{ model: "azure/gpt-4.1" }];
    expect(
      benchmarkCanonicalModelId("openai/gpt-4.1", modelResults),
    ).toBe("openai/gpt-4.1");
  });

  it("returns raw unchanged when there is no match at all", () => {
    expect(benchmarkCanonicalModelId("mystery-model", [])).toBe(
      "mystery-model",
    );
  });
});

describe("buildBenchmarkCombinedLeaderboardPayload", () => {
  it("returns null when there is no leaderboard row and no evaluator summaries", () => {
    expect(
      buildBenchmarkCombinedLeaderboardPayload(undefined, [], "Score"),
    ).toBeNull();
  });

  it("returns null when leaderboardSummary is an empty array and no evaluators", () => {
    expect(
      buildBenchmarkCombinedLeaderboardPayload([], [], "Score"),
    ).toBeNull();
  });

  it("builds rows/charts/plan for a leaderboard-only payload (no evaluators)", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      {
        model: "gpt-4.1",
        passed: "8",
        total: "10",
        pass_rate: "80",
        latency_p50: "1200",
        cost: "0.002",
        total_tokens: "500",
      },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "gpt-4.1" }];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Pass rate",
    );
    expect(result).not.toBeNull();
    expect(result!.rows).toEqual([
      {
        model: "gpt-4.1",
        passed: "8",
        total: "10",
        pass_rate: 80,
        avg_latency_ms: 1200,
        avg_cost: 0.002,
        avg_tokens: 500,
      },
    ]);
    expect(result!.plan.showOverallPassRate).toBe(true);
    expect(result!.plan.showPassedTotal).toBe(true);
    expect(result!.plan.showLatency).toBe(true);
    expect(result!.plan.showCost).toBe(true);
    expect(result!.plan.showTokens).toBe(true);
    expect(result!.plan.showToolCallPassRate).toBe(false);
    expect(result!.plan.evaluators).toEqual([]);
    // charts: pass_rate, latency, cost, tokens -> 4 charts -> 2 rows of 2
    expect(result!.chartRows).toHaveLength(2);
    expect(result!.chartRows[0]).toHaveLength(2);
    expect(result!.chartRows[0][0].title).toBe("Pass rate");
    expect(result!.chartRows[0][0].formatTooltip(80)).toBe("80%");
    expect(result!.chartRows[0][1].title).toBe("Latency (s)");
    expect(result!.chartRows[0][1].formatTooltip!(1200)).toBe("1.2 s");
    expect(result!.chartRows[0][1].yTickFormatter!(1200)).toBe("1.2");
    expect(result!.chartRows[1][0].title).toBe("Average cost (USD)");
    expect(result!.chartRows[1][0].formatTooltip(0.002)).toBe("$0.002");
    expect(result!.chartRows[1][1].title).toBe("Average tokens");
    expect(result!.chartRows[1][1].formatTooltip(500)).toBe("500");
  });

  it("falls back to legacy latency_ms when latency_p50 is absent", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "m1", pass_rate: "50", latency_ms: "900" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "m1" }];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Score",
    );
    expect(result!.rows[0].avg_latency_ms).toBe(900);
    expect(result!.plan.showLatency).toBe(true);
  });

  it("omits latency/cost/tokens rows when values are unparseable", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      {
        model: "m1",
        pass_rate: "not-a-number",
        latency_p50: null,
        latency_ms: null,
        cost: null,
        total_tokens: null,
      },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "m1" }];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Score",
    );
    expect(result!.rows[0].pass_rate).toBeUndefined();
    expect(result!.rows[0]).not.toHaveProperty("avg_latency_ms");
    expect(result!.rows[0]).not.toHaveProperty("avg_cost");
    expect(result!.rows[0]).not.toHaveProperty("avg_tokens");
    expect(result!.plan.showLatency).toBe(false);
    expect(result!.plan.showCost).toBe(false);
    expect(result!.plan.showTokens).toBe(false);
  });

  it("includes tool-call pass rate when a model has scored tool-call tests", () => {
    const modelResults: BenchmarkModelLike[] = [
      {
        model: "m1",
        test_results: [
          { passed: true, test_case: { evaluation: { type: "tool_call" } } },
          { passed: false, test_case: { evaluation: { type: "tool_call" } } },
        ],
      },
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      undefined,
      modelResults,
      "Score",
    );
    // no leaderboardSummary and no evaluator_summary -> null despite tool-call tests,
    // since showOverallPassRate is false and evaluators.length is 0
    expect(result).toBeNull();
  });

  it("includes tool-call pass rate alongside evaluators", () => {
    const modelResults: BenchmarkModelLike[] = [
      {
        model: "m1",
        evaluator_summary: [
          {
            metric_key: "politeness",
            name: "Politeness",
            type: "binary",
            passed: 3,
            total: 4,
            pass_rate: 75,
            description: "Was the agent polite?",
          },
        ],
        test_results: [
          { passed: true, test_case: { evaluation: { type: "tool_call" } } },
          { passed: false, test_case: { evaluation: { type: "tool_call" } } },
        ],
      },
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      undefined,
      modelResults,
      "Score",
    );
    expect(result).not.toBeNull();
    expect(result!.rows[0].tool_call_pass_rate).toBe(50);
    expect(result!.plan.showToolCallPassRate).toBe(true);
    const toolCallChart = result!.chartRows
      .flat()
      .find((c) => c.dataKey === "tool_call_pass_rate");
    expect(toolCallChart).toBeDefined();
    expect(toolCallChart!.formatTooltip(50)).toBe("50%");
  });

  it("builds binary and rating evaluator columns/charts, using metric_key as label fallback", () => {
    const modelResults: BenchmarkModelLike[] = [
      {
        model: "m1",
        evaluator_summary: [
          {
            metric_key: "politeness",
            name: "Politeness",
            type: "binary",
            passed: 3,
            total: 4,
            pass_rate: 75,
            description: "desc",
          },
          {
            metric_key: "coherence",
            type: "rating",
            mean: 4.2,
            min: 1,
            max: 5,
            count: 10,
            scale_min: 1,
            scale_max: 5,
          },
        ],
      },
      {
        model: "m2",
        evaluator_summary: [
          {
            metric_key: "politeness",
            name: "Politeness",
            type: "binary",
            passed: 2,
            total: 4,
            pass_rate: 50,
          },
        ],
      },
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      undefined,
      modelResults,
      "Score",
    );
    expect(result).not.toBeNull();
    expect(result!.plan.evaluators).toHaveLength(2);
    const [politenessCol, coherenceCol] = result!.plan.evaluators;
    expect(politenessCol).toMatchObject({
      metric_key: "politeness",
      dataKey: "ev_politeness",
      label: "Politeness",
      type: "binary",
      description: "desc",
    });
    expect(coherenceCol).toMatchObject({
      metric_key: "coherence",
      dataKey: "ev_coherence",
      label: "coherence",
      type: "rating",
      scale_min: 1,
      scale_max: 5,
    });

    // m1 has both metrics; m2 is missing coherence -> row value undefined
    const m1Row = result!.rows.find((r) => r.model === "m1")!;
    const m2Row = result!.rows.find((r) => r.model === "m2")!;
    expect(m1Row.ev_politeness).toBe(75);
    expect(m1Row.ev_coherence).toBe(4.2);
    expect(m2Row.ev_politeness).toBe(50);
    expect(m2Row.ev_coherence).toBeUndefined();

    const politenessChart = result!.chartRows
      .flat()
      .find((c) => c.dataKey === "ev_politeness")!;
    expect(politenessChart.title).toBe("Politeness");
    expect(politenessChart.yDomain).toEqual([0, 100]);
    expect(politenessChart.formatTooltip(75)).toBe("75%");

    const coherenceChart = result!.chartRows
      .flat()
      .find((c) => c.dataKey === "ev_coherence")!;
    expect(coherenceChart.title).toBe("coherence (1–5)");
    expect(coherenceChart.yDomain).toEqual([1, 5]);
    expect(coherenceChart.formatTooltip(4.2)).toBe("4.2");
  });

  it("uses default [0,5] yDomain for rating evaluators with non-finite scale", () => {
    const modelResults: BenchmarkModelLike[] = [
      {
        model: "m1",
        evaluator_summary: [
          {
            metric_key: "coherence",
            type: "rating",
            mean: 3,
            min: 1,
            max: 5,
            count: 1,
            scale_min: NaN,
            scale_max: NaN,
          },
        ],
      },
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      undefined,
      modelResults,
      "Score",
    );
    const coherenceChart = result!.chartRows
      .flat()
      .find((c) => c.dataKey === "ev_coherence")!;
    expect(coherenceChart.yDomain).toEqual([0, 5]);
    expect(coherenceChart.title).toBe("coherence");
  });

  it("orders models by leaderboardSummary first, then remaining model_results", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "m2", pass_rate: "60" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "m1" },
      { model: "m2" },
      { model: "m3" },
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Score",
    );
    expect(result!.rows.map((r) => r.model)).toEqual(["m2", "m1", "m3"]);
  });

  it("maps leaderboardSummary entries to canonical model ids via suffix matching", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gpt-4.1", pass_rate: "90" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "openai/gpt-4.1" }];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Score",
    );
    expect(result!.rows[0].model).toBe("openai/gpt-4.1");
    expect(result!.rows[0].pass_rate).toBe(90);
  });

  it("skips a model_results entry with no matching leaderboard row and no evaluator_summary", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "m1", pass_rate: "60" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "m1" },
      { model: "m2" }, // no lbRow, no evaluator_summary, no test_results
    ];
    const result = buildBenchmarkCombinedLeaderboardPayload(
      leaderboardSummary,
      modelResults,
      "Score",
    );
    expect(result!.rows).toHaveLength(2);
    const m2Row = result!.rows.find((r) => r.model === "m2")!;
    expect(m2Row).toEqual({ model: "m2" });
  });
});
