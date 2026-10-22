import {
  hasReliabilityNumber,
  hasTaskOverviewData,
  buildOverviewRows,
  overviewChartSeries,
  overviewRows,
  taskEvaluatorScoreCards,
} from "../taskOverviewData";

describe("hasTaskOverviewData", () => {
  it("is false with no agreement response", () => {
    expect(hasTaskOverviewData(null, [])).toBe(false);
  });

  it("is false when nothing has been labelled, scored, or run", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: { count: 0 }, human_result: { count: 0 } },
          ],
        },
        [{ status: "queued" }, { status: "failed" }],
      ),
    ).toBe(false);
  });

  it("is true when annotators labelled but no evaluator has run", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: null, human_result: { count: 7 } },
          ],
        },
        [],
      ),
    ).toBe(true);
  });

  it("is false when the human score covers no items", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [
            { pair_count: 0, result: null, human_result: { count: 0 } },
          ],
        },
        [],
      ),
    ).toBe(false);
  });

  it("is true when annotators agree with each other", () => {
    expect(hasTaskOverviewData({ human_human: { pair_count: 4 } }, [])).toBe(
      true,
    );
  });

  it("is true when an evaluator lines up with the annotators", () => {
    expect(
      hasTaskOverviewData(
        { human_human: { pair_count: 0 }, evaluators: [{ pair_count: 3 }] },
        [],
      ),
    ).toBe(true);
  });

  it("is true when an evaluator has scores but no human labels", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [{ pair_count: 0, result: { count: 12 } }],
        },
        [],
      ),
    ).toBe(true);
  });

  it("is false when a run finished but its evaluator is off the task", () => {
    expect(
      hasTaskOverviewData({ human_human: { pair_count: 0 }, evaluators: [] }, [
        { status: "completed" },
      ]),
    ).toBe(false);
  });

  it("is true when a run finished even though agreement is empty", () => {
    expect(
      hasTaskOverviewData(
        {
          human_human: { pair_count: 0 },
          evaluators: [{ pair_count: 0, result: null }],
        },
        [{ status: "completed" }],
      ),
    ).toBe(true);
  });
});

describe("hasTaskOverviewData with an evaluator score card", () => {
  const empty = { human_human: { pair_count: 0 }, evaluators: [] };

  it("is true when a card is on screen with nothing else to show", () => {
    expect(hasTaskOverviewData(empty, [], true)).toBe(true);
  });

  it("is still false without one", () => {
    expect(hasTaskOverviewData(empty, [], false)).toBe(false);
  });

  it("is false with no agreement response, card or not", () => {
    expect(hasTaskOverviewData(null, [], true)).toBe(false);
  });
});

describe("taskEvaluatorScoreCards", () => {
  const stat = { label: "Score", value: "89%", ratio: 0.89 };
  const evaluators = [
    { evaluator_id: "ev-1", name: "Correctness" },
    { evaluator_id: "ev-2", name: "Reply Conciseness" },
    { evaluator_id: "tc-1", name: "Tool call correctness" },
  ];

  it("leaves out an evaluator that has no score", () => {
    const cards = taskEvaluatorScoreCards(evaluators, {
      "ev-1": stat,
      "ev-2": null,
    });
    expect(cards).toEqual([{ evaluatorId: "ev-1", name: "Correctness", stat }]);
  });

  it("leaves out tool call correctness until it has a score", () => {
    const cards = taskEvaluatorScoreCards(evaluators, { "ev-1": stat });
    expect(cards).toEqual([{ evaluatorId: "ev-1", name: "Correctness", stat }]);
  });

  it("shows the tool call score once there is one", () => {
    const cards = taskEvaluatorScoreCards(evaluators, { "tc-1": stat });
    expect(cards).toEqual([
      { evaluatorId: "tc-1", name: "Tool call correctness", stat },
    ]);
  });

  it("has no cards when nothing has run", () => {
    expect(taskEvaluatorScoreCards(evaluators, {})).toEqual([]);
  });
});

describe("hasReliabilityNumber", () => {
  it("is false when nothing has been labelled, so the row of dashes goes", () => {
    expect(
      hasReliabilityNumber({ current: null }, [
        { current: null },
        { current: null },
      ]),
    ).toBe(false);
    expect(hasReliabilityNumber(null, [])).toBe(false);
    expect(hasReliabilityNumber(undefined, [{}])).toBe(false);
  });

  it("is true as soon as one card has a number", () => {
    expect(hasReliabilityNumber({ current: 0.5 }, [{ current: null }])).toBe(
      true,
    );
    expect(hasReliabilityNumber(null, [{ current: 0 }])).toBe(true);
  });
});

describe("overviewRows", () => {
  const g = (current: number | null, kappa?: number | null) => ({
    current,
    kappa,
  });
  const rows = [
    { key: "empty", withHumans: g(null, null), interAnnotator: g(null) },
    { key: "with-humans", withHumans: g(0.8), interAnnotator: g(null) },
    { key: "inter-only", withHumans: g(null), interAnnotator: g(0.6) },
    { key: "kappa-only", withHumans: g(null), interAnnotator: g(null, 0) },
  ];

  it("leaves out evaluators with nothing in either group across all tasks", () => {
    expect(overviewRows(rows, true).map((r) => r.key)).toEqual([
      "with-humans",
      "inter-only",
      "kappa-only",
    ]);
  });

  it("keeps every evaluator on one task", () => {
    expect(overviewRows(rows, false).map((r) => r.key)).toEqual([
      "empty",
      "with-humans",
      "inter-only",
      "kappa-only",
    ]);
  });
});

describe("buildOverviewRows and overviewChartSeries", () => {
  const point = (agreement: number) => ({
    bucket_start: "2026-01-01",
    bucket_end: "2026-01-31",
    agreement,
    pair_count: 2,
  });
  const evaluators = [
    {
      evaluator_id: "ev-1",
      name: "Tone",
      current: 0.9,
      pair_count: 4,
      series: [point(0.9)],
      kappa: 0.5,
      kappa_type: "cohen" as const,
      inter_annotator: {
        current: 0.7,
        pair_count: 3,
        series: [point(0.7)],
        kappa: 0.4,
        kappa_type: "cohen" as const,
      },
    },
    {
      evaluator_id: "ev-2",
      name: "Clarity",
      current: null,
      pair_count: 0,
      series: [],
      kappa: null,
      kappa_type: "linear_weighted_cohen" as const,
    },
    {
      evaluator_id: "ev-3",
      name: "Unknown",
      current: null,
      pair_count: 0,
      series: [],
    },
  ];

  it("gives each evaluator its colour, its kind of answer and both groups", () => {
    const rows = buildOverviewRows(evaluators);
    expect(rows.map((r) => [r.key, r.color, r.kind])).toEqual([
      ["ev-1", "var(--chart-1)", "binary"],
      ["ev-2", "var(--chart-2)", "rating"],
      ["ev-3", "var(--chart-3)", null],
    ]);
    expect(rows[0].interAnnotator.current).toBe(0.7);
    expect(rows[0].withHumans.current).toBe(0.9);
    expect(rows[1].interAnnotator).toEqual({
      current: null,
      pair_count: 0,
      series: [],
    });
  });

  it("puts the two overall lines first, then each evaluator's dashed and solid lines", () => {
    const series = overviewChartSeries(
      {
        human_human: { current: 0.6, pair_count: 3, series: [point(0.6)] },
        evaluators_with_humans: {
          current: 0.8,
          pair_count: 4,
          series: [point(0.8)],
        },
      },
      buildOverviewRows(evaluators.slice(0, 1)),
      () => "Jan",
    );
    expect(
      series.map((s) => [s.key, s.name, s.color, !!s.dashed, !!s.overall]),
    ).toEqual([
      [
        "overall_inter_annotator",
        "Overall inter-annotator agreement",
        "var(--foreground)",
        true,
        true,
      ],
      [
        "overall_with_humans",
        "Overall evaluator agreement with humans",
        "var(--foreground)",
        false,
        true,
      ],
      [
        "ev-1__inter_annotator",
        "Tone inter-annotator agreement",
        "var(--chart-1)",
        true,
        false,
      ],
      ["ev-1", "Tone agreement with humans", "var(--chart-1)", false, false],
    ]);
    expect(series[2].points[0]).toMatchObject({
      key: "2026-01-31",
      label: "Jan",
      agreement: 0.7,
    });
  });
});

