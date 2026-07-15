import React from "react";
import { render, screen, setupUser } from "../../../test-utils";
import {
  findFirstEvaluatorRuns,
  evaluatorColumnsFromRuns,
  evaluatorDescriptionMapFromRuns,
  ratingRange,
  hasSTTEmptyPredictions,
  getFirstSTTEmptyPredictionIndex,
  STTEvaluationAbout,
  TTSEvaluationAbout,
  STTEvaluationLeaderboard,
  TTSEvaluationLeaderboard,
  STTEvaluationOutputs,
  TTSEvaluationOutputs,
  WER_ABOUT_METRIC,
  CER_ABOUT_METRIC,
  TTFB_ABOUT_METRIC,
  type EvaluatorAboutMetricRow,
  type STTProviderResultForDetails,
  type TTSProviderResultForDetails,
} from "../EvaluationRunDetails";
import type { STTEvaluatorColumn } from "../STTResultsTable";
import type { TTSEvaluatorColumn } from "../TTSResultsTable";

// ---- Mocks -----------------------------------------------------------

jest.mock("../AboutMetricsTable", () => ({
  AboutMetricsTable: ({ metrics }: { metrics: unknown }) => (
    <div data-testid="about-metrics-table">{JSON.stringify(metrics)}</div>
  ),
}));

// `mock`-prefixed identifiers are allowed inside jest.mock factories despite
// hoisting (babel-plugin-jest-hoist whitelists the "mock" prefix), so this lets
// tests reach into the actual props (including render functions) passed to
// LeaderboardTab without resorting to jest.isolateModules gymnastics.
const mockLeaderboardCapture: { props: Record<string, unknown> | null } = {
  props: null,
};

jest.mock("../LeaderboardTab", () => ({
  LeaderboardTab: (props: Record<string, unknown>) => {
    mockLeaderboardCapture.props = props;
    return (
      <div data-testid="leaderboard-tab">
        <div data-testid="leaderboard-columns">
          {JSON.stringify(
            (props.columns as Array<{ key: string; header: string }>).map(
              (c) => ({ key: c.key, header: c.header }),
            ),
          )}
        </div>
        <div data-testid="leaderboard-data">{JSON.stringify(props.data)}</div>
        <div data-testid="leaderboard-charts">
          {JSON.stringify(
            (props.charts as Array<Array<{ title: string; dataKey: string }>>).map(
              (row) => row.map((c) => ({ title: c.title, dataKey: c.dataKey })),
            ),
          )}
        </div>
        <div data-testid="leaderboard-filename">{props.filename as string}</div>
      </div>
    );
  },
}));

jest.mock("../ProviderSidebar", () => ({
  ProviderSidebar: ({
    items,
    activeKey,
    onSelect,
  }: {
    items: Array<{ key: string; label: string; success: boolean | null }>;
    activeKey: string | null;
    onSelect: (key: string) => void;
  }) => (
    <div data-testid="provider-sidebar">
      {items.map((item) => (
        <button
          key={item.key}
          data-testid={`sidebar-item-${item.key}`}
          data-active={activeKey === item.key}
          data-success={String(item.success)}
          onClick={() => onSelect(item.key)}
        >
          {item.label}
        </button>
      ))}
    </div>
  ),
}));

jest.mock("../ProviderMetricsCard", () => ({
  ProviderMetricsCard: ({
    metrics,
  }: {
    metrics: Array<{ label: string; value: unknown }>;
  }) => (
    <div data-testid="provider-metrics-card">
      {metrics.map((m) => (
        <div key={m.label} data-testid={`metric-${m.label}`}>
          {String(m.value)}
        </div>
      ))}
    </div>
  ),
}));

jest.mock("../STTResultsTable", () => ({
  STTResultsTable: ({
    results,
    showMetrics,
  }: {
    results: unknown[];
    showMetrics: boolean;
  }) => (
    <div
      data-testid="stt-results-table"
      data-show-metrics={String(showMetrics)}
    >
      {results.length} rows
    </div>
  ),
}));

jest.mock("../TTSResultsTable", () => ({
  TTSResultsTable: ({
    results,
    showMetrics,
  }: {
    results: unknown[];
    showMetrics: boolean;
  }) => (
    <div
      data-testid="tts-results-table"
      data-show-metrics={String(showMetrics)}
    >
      {results.length} rows
    </div>
  ),
}));

// ---- Pure helper functions --------------------------------------------

describe("findFirstEvaluatorRuns", () => {
  it("returns the first non-empty evaluator_runs array", () => {
    const runs = [{ metric_key: "a" }];
    const result = findFirstEvaluatorRuns([
      { evaluator_runs: [] },
      { evaluator_runs: null },
      { evaluator_runs: runs },
      { evaluator_runs: [{ metric_key: "b" }] },
    ]);
    expect(result).toBe(runs);
  });

  it("returns undefined when no provider has evaluator_runs", () => {
    expect(
      findFirstEvaluatorRuns([{ evaluator_runs: [] }, { evaluator_runs: null }]),
    ).toBeUndefined();
  });

  it("returns undefined for an empty providerResults array", () => {
    expect(findFirstEvaluatorRuns([])).toBeUndefined();
  });
});

describe("evaluatorColumnsFromRuns", () => {
  it("maps runs to columns with outputType rating when aggregate.type is rating", () => {
    const cols = evaluatorColumnsFromRuns([
      {
        metric_key: "clarity",
        name: "Clarity",
        aggregate: { type: "rating" },
      },
    ]);
    expect(cols).toEqual([
      {
        key: "clarity",
        label: "Clarity",
        outputType: "rating",
        scoreField: "clarity",
        reasoningField: "clarity_reasoning",
      },
    ]);
  });

  it("defaults outputType to binary when aggregate.type is not rating", () => {
    const cols = evaluatorColumnsFromRuns([
      { metric_key: "pass_fail", aggregate: { type: "binary" } },
    ]);
    expect(cols[0].outputType).toBe("binary");
  });

  it("defaults outputType to binary when aggregate is null", () => {
    const cols = evaluatorColumnsFromRuns([
      { metric_key: "no_agg", aggregate: null },
    ]);
    expect(cols[0].outputType).toBe("binary");
  });

  it("defaults outputType to binary when aggregate is undefined", () => {
    const cols = evaluatorColumnsFromRuns([{ metric_key: "no_agg2" }]);
    expect(cols[0].outputType).toBe("binary");
  });

  it("falls back to metric_key for label when name is missing", () => {
    const cols = evaluatorColumnsFromRuns([{ metric_key: "raw_key" }]);
    expect(cols[0].label).toBe("raw_key");
  });
});

describe("evaluatorDescriptionMapFromRuns", () => {
  it("builds a map keyed by metric_key with description fallback to empty string", () => {
    const map = evaluatorDescriptionMapFromRuns([
      { metric_key: "a", description: "desc a" },
      { metric_key: "b" },
    ]);
    expect(map.get("a")).toBe("desc a");
    expect(map.get("b")).toBe("");
  });

  it("returns an empty map when runs is undefined", () => {
    const map = evaluatorDescriptionMapFromRuns(undefined);
    expect(map.size).toBe(0);
  });
});

describe("ratingRange", () => {
  it("returns '-' for an empty array", () => {
    expect(ratingRange([])).toBe("-");
  });

  it("returns the single value as a string when all values are equal", () => {
    expect(ratingRange([3, 3, 3])).toBe("3");
  });

  it("returns 'min - max' for multiple distinct values", () => {
    expect(ratingRange([1, 5, 3])).toBe("1 - 5");
  });
});

describe("hasSTTEmptyPredictions", () => {
  it("returns true when a result has an empty pred", () => {
    expect(
      hasSTTEmptyPredictions({
        provider: "p",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "", wer: "0" }],
      } as STTProviderResultForDetails),
    ).toBe(true);
  });

  it("returns true when a result has a whitespace-only pred", () => {
    expect(
      hasSTTEmptyPredictions({
        provider: "p",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "   ", wer: "0" }],
      } as STTProviderResultForDetails),
    ).toBe(true);
  });

  it("returns false when no result has an empty pred", () => {
    expect(
      hasSTTEmptyPredictions({
        provider: "p",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "hello", wer: "0" }],
      } as STTProviderResultForDetails),
    ).toBe(false);
  });

  it("returns false when results is null", () => {
    expect(
      hasSTTEmptyPredictions({
        provider: "p",
        success: true,
        results: null,
      } as STTProviderResultForDetails),
    ).toBe(false);
  });

  it("returns false when results is undefined", () => {
    expect(
      hasSTTEmptyPredictions({
        provider: "p",
        success: true,
      } as STTProviderResultForDetails),
    ).toBe(false);
  });
});

describe("getFirstSTTEmptyPredictionIndex", () => {
  it("returns the index of the first empty pred", () => {
    expect(
      getFirstSTTEmptyPredictionIndex({
        provider: "p",
        success: true,
        results: [
          { id: "1", gt: "hi", pred: "hello", wer: "0" },
          { id: "2", gt: "hi", pred: "", wer: "0" },
        ],
      } as STTProviderResultForDetails),
    ).toBe(1);
  });

  it("returns -1 when there are no empty preds", () => {
    expect(
      getFirstSTTEmptyPredictionIndex({
        provider: "p",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "hello", wer: "0" }],
      } as STTProviderResultForDetails),
    ).toBe(-1);
  });

  it("returns -1 when results is missing", () => {
    expect(
      getFirstSTTEmptyPredictionIndex({
        provider: "p",
        success: true,
      } as STTProviderResultForDetails),
    ).toBe(-1);
  });
});

// ---- About wrapper components ------------------------------------------

const binaryRow: EvaluatorAboutMetricRow = {
  key: "pass_fail",
  metric: "Pass/Fail",
  description: "Whether it passed",
  outputType: "binary",
};

const ratingRow: EvaluatorAboutMetricRow = {
  key: "clarity",
  metric: "Clarity",
  description: "How clear it is",
  outputType: "rating",
};

const explicitRangeRow: EvaluatorAboutMetricRow = {
  key: "custom",
  metric: "Custom",
  description: "Custom metric",
  outputType: "rating",
  range: "1 - 10",
};

describe("STTEvaluationAbout", () => {
  it("prepends WER_ABOUT_METRIC and CER_ABOUT_METRIC, then maps rows with correct preference/range", () => {
    render(
      <STTEvaluationAbout evaluatorRows={[binaryRow, ratingRow, explicitRangeRow]} />,
    );
    const text = screen.getByTestId("about-metrics-table").textContent ?? "";
    const metrics = JSON.parse(text);

    expect(metrics[0]).toEqual(WER_ABOUT_METRIC);
    expect(metrics[1]).toEqual(CER_ABOUT_METRIC);
    expect(metrics[2]).toMatchObject({
      key: "pass_fail",
      preference: "Pass is better",
      range: "Pass / Fail",
    });
    expect(metrics[3]).toMatchObject({
      key: "clarity",
      preference: "Higher is better",
      range: "-",
    });
    expect(metrics[4]).toMatchObject({
      key: "custom",
      preference: "Higher is better",
      range: "1 - 10",
    });
  });
});

describe("TTSEvaluationAbout", () => {
  it("appends TTFB_ABOUT_METRIC after mapped rows", () => {
    render(<TTSEvaluationAbout evaluatorRows={[binaryRow]} />);
    const text = screen.getByTestId("about-metrics-table").textContent ?? "";
    const metrics = JSON.parse(text);

    expect(metrics).toHaveLength(2);
    expect(metrics[0]).toMatchObject({
      key: "pass_fail",
      preference: "Pass is better",
      range: "Pass / Fail",
    });
    expect(metrics[1]).toEqual(TTFB_ABOUT_METRIC);
  });
});

// ---- Leaderboard wrapper components -------------------------------------

const getProviderLabel = (v: string) => `Provider ${v}`;

describe("STTEvaluationLeaderboard", () => {
  it("builds WER + CER charts plus one chart per evaluator column, chunked into rows of two", () => {
    render(
      <STTEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai", wer: 0.1, cer: 0.05 }]}
        evaluatorColumns={
          [
            { key: "a", label: "A", outputType: "binary", scoreField: "a" },
            { key: "b", label: "B", outputType: "rating", scoreField: "b" },
            { key: "c", label: "C", outputType: "binary", scoreField: "c" },
          ] satisfies STTEvaluatorColumn[]
        }
        getProviderLabel={getProviderLabel}
      />,
    );

    const charts = JSON.parse(
      screen.getByTestId("leaderboard-charts").textContent ?? "[]",
    );
    // 5 charts total (WER + CER + A + B + C) chunked into rows of 2 => 3 rows
    expect(charts).toEqual([
      [
        { title: "WER", dataKey: "wer" },
        { title: "CER", dataKey: "cer" },
      ],
      [
        { title: "A", dataKey: "a" },
        { title: "B", dataKey: "b" },
      ],
      [{ title: "C", dataKey: "c" }],
    ]);

    const columns = JSON.parse(
      screen.getByTestId("leaderboard-columns").textContent ?? "[]",
    );
    expect(columns).toEqual([
      { key: "run", header: "Run" },
      { key: "wer", header: "WER" },
      { key: "cer", header: "CER" },
      { key: "a", header: "A" },
      { key: "b", header: "B" },
      { key: "c", header: "C" },
    ]);

    expect(screen.getByTestId("leaderboard-filename").textContent).toBe(
      "stt-evaluation-leaderboard",
    );
  });
});

describe("TTSEvaluationLeaderboard", () => {
  it("uses ttfb_p50 key and appends Latency chart when a row has ttfb_p50", () => {
    render(
      <TTSEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai", ttfb_p50: 0.5 }]}
        evaluatorColumns={
          [
            { key: "a", label: "A", outputType: "binary", scoreField: "a" },
          ] satisfies TTSEvaluatorColumn[]
        }
        getProviderLabel={getProviderLabel}
      />,
    );

    const charts = JSON.parse(
      screen.getByTestId("leaderboard-charts").textContent ?? "[]",
    );
    expect(charts).toEqual([
      [
        { title: "A", dataKey: "a" },
        { title: "Latency (s)", dataKey: "ttfb_p50" },
      ],
    ]);

    const columns = JSON.parse(
      screen.getByTestId("leaderboard-columns").textContent ?? "[]",
    );
    expect(columns).toEqual([
      { key: "run", header: "Run" },
      { key: "a", header: "A" },
      { key: "ttfb_p50", header: "Latency (s)" },
    ]);
  });

  it("falls back to the legacy ttfb key when no row has ttfb_p50", () => {
    render(
      <TTSEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai", ttfb: 0.7 }]}
        evaluatorColumns={[]}
        getProviderLabel={getProviderLabel}
      />,
    );

    const charts = JSON.parse(
      screen.getByTestId("leaderboard-charts").textContent ?? "[]",
    );
    expect(charts).toEqual([[{ title: "Latency (s)", dataKey: "ttfb" }]]);
  });

  it("formats the ttfbKey column's render function to 4 decimals, and '-' for null/undefined", () => {
    render(
      <TTSEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai", ttfb_p50: 0.123456 }]}
        evaluatorColumns={[]}
        getProviderLabel={getProviderLabel}
      />,
    );

    const columns = (mockLeaderboardCapture.props as unknown as Record<string, unknown>)
      .columns as Array<{
      key: string;
      header: string;
      render?: (v: unknown) => unknown;
    }>;
    const ttfbColumn = columns.find((c) => c.key === "ttfb_p50");
    expect(ttfbColumn).toBeDefined();
    expect(ttfbColumn?.render?.(0.123456789)).toBe(0.1235);
    expect(ttfbColumn?.render?.(undefined)).toBe("-");
    expect(ttfbColumn?.render?.(null)).toBe("-");
  });

  it("run column render calls getProviderLabel", () => {
    const label = jest.fn((v: string) => `Label:${v}`);
    render(
      <STTEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai" }]}
        evaluatorColumns={[]}
        getProviderLabel={label}
      />,
    );
    const columns = (mockLeaderboardCapture.props as unknown as Record<string, unknown>)
      .columns as Array<{
      key: string;
      header: string;
      render?: (v: unknown) => unknown;
    }>;
    const runColumn = columns.find((c) => c.key === "run");
    expect(runColumn?.render?.("openai")).toBe("Label:openai");
    expect(label).toHaveBeenCalledWith("openai");
  });

  it("builds chart yDomain/formatters for binary and rating (with/without scaleMax) evaluator columns", () => {
    render(
      <STTEvaluationLeaderboard
        leaderboardSummary={[{ run: "openai" }]}
        evaluatorColumns={
          [
            { key: "bin", label: "Bin", outputType: "binary", scoreField: "bin" },
            {
              key: "rate_scale",
              label: "RateScale",
              outputType: "rating",
              scoreField: "rate_scale",
              scaleMax: 5,
            },
            {
              key: "rate_noscale",
              label: "RateNoScale",
              outputType: "rating",
              scoreField: "rate_noscale",
            },
          ] satisfies STTEvaluatorColumn[]
        }
        getProviderLabel={getProviderLabel}
      />,
    );

    type CapturedChart = {
      dataKey: string;
      yDomain?: [number, number];
      yTickFormatter?: (v: number) => string;
      formatTooltip?: (v: number) => string;
    };
    const capturedProps = mockLeaderboardCapture.props as unknown as Record<
      string,
      unknown
    >;
    const charts = (capturedProps.charts as CapturedChart[][]).flat();
    const binChart = charts.find((c) => c.dataKey === "bin");
    const rateScaleChart = charts.find((c) => c.dataKey === "rate_scale");
    const rateNoScaleChart = charts.find((c) => c.dataKey === "rate_noscale");

    expect(binChart).toBeDefined();
    expect(rateScaleChart).toBeDefined();
    expect(rateNoScaleChart).toBeDefined();

    expect(binChart!.yDomain).toEqual([0, 1]);
    expect(binChart!.yTickFormatter!(0.5)).toBe("50%");
    expect(binChart!.formatTooltip!(0.5)).toBe("50%");

    expect(rateScaleChart!.yDomain).toEqual([0, 5]);
    expect(rateScaleChart!.yTickFormatter).toBeUndefined();
    expect(rateScaleChart!.formatTooltip!(3.14159)).toBe("3.1416/5");

    expect(rateNoScaleChart!.yDomain).toBeUndefined();
    expect(rateNoScaleChart!.formatTooltip).toBeUndefined();

    const columns = capturedProps.columns as Array<{
      key: string;
      render?: (v: unknown) => unknown;
    }>;
    const binColumn = columns.find((c) => c.key === "bin");
    const rateScaleColumn = columns.find((c) => c.key === "rate_scale");
    expect(binColumn?.render?.(0.75)).toBe("75%");
    expect(binColumn?.render?.("not-a-number")).toBe("-");
    expect(rateScaleColumn?.render?.(4.2)).toBe("4.2/5");
  });
});

// ---- STTEvaluationOutputs ------------------------------------------------

const sttColumns = [
  { key: "clarity", label: "Clarity", outputType: "rating" as const, scoreField: "clarity" },
];

describe("STTEvaluationOutputs", () => {
  const baseProps = {
    activeProviderKey: null as string | null,
    onProviderSelect: jest.fn(),
    status: "done" as const,
    evaluatorColumns: sttColumns,
    getProviderLabel,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows 'Select a provider' when providerResults is empty", () => {
    render(<STTEvaluationOutputs {...baseProps} providerResults={[]} />);
    expect(
      screen.getByText("Select a provider to view details"),
    ).toBeInTheDocument();
  });

  it("shows loading state when success is null and there are no results", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: null, results: [] },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.queryByText("Select a provider to view details"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("provider-metrics-card")).not.toBeInTheDocument();
    expect(screen.queryByTestId("stt-results-table")).not.toBeInTheDocument();
  });

  it("shows error state when the task failed before the provider produced results", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: null, results: [] },
    ];
    render(
      <STTEvaluationOutputs
        {...baseProps}
        status="failed"
        providerResults={providerResults}
      />,
    );
    expect(
      screen.getByText(
        "There was an error running this provider. Please contact us by posting your issue to help us help you.",
      ),
    ).toBeInTheDocument();
  });

  it("shows error state when success is false", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: false },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByText(
        "There was an error running this provider. Please contact us by posting your issue to help us help you.",
      ),
    ).toBeInTheDocument();
  });

  it("renders metrics card with WER, CER and evaluator columns when success is true and metrics present", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: true,
        metrics: { wer: 0.123456, cer: 0.056789 },
        evaluator_runs: [
          { metric_key: "clarity", aggregate: { mean: 0.8 } },
        ],
        results: [],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("provider-metrics-card")).toBeInTheDocument();
    expect(screen.getByTestId("metric-WER").textContent).toBe("0.1235");
    expect(screen.getByTestId("metric-CER").textContent).toBe("0.0568");
    expect(screen.getByTestId("metric-Clarity").textContent).toBe("0.8");
  });

  it("renders '-' for WER and CER when their metrics are null", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: true,
        metrics: { wer: null as unknown as number, cer: null as unknown as number },
        results: [],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("metric-WER").textContent).toBe("-");
    expect(screen.getByTestId("metric-CER").textContent).toBe("-");
  });

  it("renders the results table when results is non-empty", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "hi", wer: "0" }],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("stt-results-table")).toBeInTheDocument();
    expect(screen.getByTestId("stt-results-table").textContent).toBe("1 rows");
  });

  it("showMetrics is true when success === true even without result-level scores", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "hi", wer: "" }],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is true when success is null but a row has a non-empty wer", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: null,
        results: [{ id: "1", gt: "hi", pred: "hi", wer: "0.2" }],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is true when a row has an evaluator_outputs object value", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: null,
        results: [
          {
            id: "1",
            gt: "hi",
            pred: "hi",
            wer: "",
            evaluator_outputs: { clarity: { score: 1 } },
          },
        ],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is true when a row has a non-empty evaluatorColumns score field", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: null,
        results: [
          { id: "1", gt: "hi", pred: "hi", wer: "", clarity: 0.5 },
        ],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics falls back to `${key}_score` when a column has no scoreField", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: null,
        results: [
          { id: "1", gt: "hi", pred: "hi", wer: "", clarity_score: 0.5 },
        ],
      },
    ];
    render(
      <STTEvaluationOutputs
        {...baseProps}
        evaluatorColumns={
          [
            { key: "clarity", label: "Clarity", outputType: "rating" },
          ] satisfies STTEvaluatorColumn[]
        }
        providerResults={providerResults}
      />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is false when success is null and no row has any score", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: null,
        results: [{ id: "1", gt: "hi", pred: "hi", wer: "" }],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("stt-results-table").getAttribute("data-show-metrics"),
    ).toBe("false");
  });

  it("selects the first provider by default and marks sidebar item active", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: true, metrics: { wer: 0.1 }, results: [] },
      { provider: "azure", success: true, metrics: { wer: 0.2 }, results: [] },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("sidebar-item-openai").getAttribute("data-active"),
    ).toBe("true");
  });

  it("sidebar item success is false when provider has empty predictions despite success true", () => {
    const providerResults: STTProviderResultForDetails[] = [
      {
        provider: "openai",
        success: true,
        results: [{ id: "1", gt: "hi", pred: "", wer: "0" }],
      },
    ];
    render(
      <STTEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("sidebar-item-openai").getAttribute("data-success"),
    ).toBe("false");
  });

  it("calls onProviderSelect when a sidebar item is clicked", async () => {
    const user = setupUser();
    const onProviderSelect = jest.fn();
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: true, metrics: { wer: 0.1 }, results: [] },
      { provider: "azure", success: true, metrics: { wer: 0.2 }, results: [] },
    ];
    render(
      <STTEvaluationOutputs
        {...baseProps}
        onProviderSelect={onProviderSelect}
        providerResults={providerResults}
      />,
    );
    await user.click(screen.getByTestId("sidebar-item-azure"));
    expect(onProviderSelect).toHaveBeenCalledWith("azure");
  });

  it("uses activeProviderKey to select a non-default provider", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: true, metrics: { wer: 0.1 }, results: [] },
      { provider: "azure", success: true, metrics: { wer: 0.2 }, results: [] },
    ];
    render(
      <STTEvaluationOutputs
        {...baseProps}
        activeProviderKey="azure"
        providerResults={providerResults}
      />,
    );
    expect(screen.getByTestId("metric-WER").textContent).toBe("0.2");
  });

  it("shows 'Select a provider' when activeProviderKey doesn't match any provider", () => {
    const providerResults: STTProviderResultForDetails[] = [
      { provider: "openai", success: true, metrics: { wer: 0.1 }, results: [] },
    ];
    render(
      <STTEvaluationOutputs
        {...baseProps}
        activeProviderKey="nonexistent"
        providerResults={providerResults}
      />,
    );
    expect(
      screen.getByText("Select a provider to view details"),
    ).toBeInTheDocument();
  });
});

// ---- TTSEvaluationOutputs ------------------------------------------------

const ttsColumns = [
  { key: "clarity", label: "Clarity", outputType: "rating" as const, scoreField: "clarity" },
];

describe("TTSEvaluationOutputs", () => {
  const baseProps = {
    activeProviderKey: null as string | null,
    onProviderSelect: jest.fn(),
    status: "done" as const,
    evaluatorColumns: ttsColumns,
    getProviderLabel,
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows 'Select a provider' when providerResults is empty", () => {
    render(<TTSEvaluationOutputs {...baseProps} providerResults={[]} />);
    expect(
      screen.getByText("Select a provider to view details"),
    ).toBeInTheDocument();
  });

  it("shows loading state when success is null and there are no results", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      { provider: "elevenlabs", success: null, results: [] },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.queryByText("Select a provider to view details"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("provider-metrics-card")).not.toBeInTheDocument();
  });

  it("shows error state when the task failed before the provider produced results", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      { provider: "elevenlabs", success: null, results: [] },
    ];
    render(
      <TTSEvaluationOutputs
        {...baseProps}
        status="failed"
        providerResults={providerResults}
      />,
    );
    expect(
      screen.getByText(
        "There was an error running this provider. Please contact us by posting your issue to help us help you.",
      ),
    ).toBeInTheDocument();
  });

  it("shows error state when success is false", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      { provider: "elevenlabs", success: false },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByText(
        "There was an error running this provider. Please contact us by posting your issue to help us help you.",
      ),
    ).toBeInTheDocument();
  });

  it("renders metrics card with evaluator columns and latency using p50", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: true,
        metrics: { ttfb: { p50: 0.123456, mean: 9 } },
        evaluator_runs: [
          { metric_key: "clarity", aggregate: { mean: 0.9 } },
        ],
        results: [],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("metric-Clarity").textContent).toBe("0.9");
    expect(screen.getByTestId("metric-Latency (s)").textContent).toBe("0.1235");
  });

  it("falls back to metrics.ttfb.mean when p50 is absent", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: true,
        metrics: { ttfb: { mean: 0.5 } },
        results: [],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("metric-Latency (s)").textContent).toBe("0.5");
  });

  it("renders '-' for latency when ttfb metrics are missing", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: true,
        metrics: {},
        results: [],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("metric-Latency (s)").textContent).toBe("-");
  });

  it("renders the results table when results is non-empty", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: true,
        results: [{ id: "1", text: "hi", audio_path: "x" }],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(screen.getByTestId("tts-results-table")).toBeInTheDocument();
    expect(screen.getByTestId("tts-results-table").textContent).toBe("1 rows");
  });

  it("showMetrics is true when success === true", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: true,
        results: [{ id: "1", text: "hi", audio_path: "x" }],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("tts-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is true when success is null but a row has an evaluator score field", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: null,
        results: [
          { id: "1", text: "hi", audio_path: "x", clarity: 0.5 },
        ],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("tts-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is true when a row has an evaluator_outputs object value", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: null,
        results: [
          {
            id: "1",
            text: "hi",
            audio_path: "x",
            evaluator_outputs: { clarity: { score: 1 } },
          },
        ],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("tts-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics falls back to `${key}_score` when a column has no scoreField", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: null,
        results: [
          { id: "1", text: "hi", audio_path: "x", clarity_score: 0.5 },
        ],
      },
    ];
    render(
      <TTSEvaluationOutputs
        {...baseProps}
        evaluatorColumns={
          [
            { key: "clarity", label: "Clarity", outputType: "rating" },
          ] satisfies TTSEvaluatorColumn[]
        }
        providerResults={providerResults}
      />,
    );
    expect(
      screen.getByTestId("tts-results-table").getAttribute("data-show-metrics"),
    ).toBe("true");
  });

  it("showMetrics is false when success is null and no row has any score", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      {
        provider: "elevenlabs",
        success: null,
        results: [{ id: "1", text: "hi", audio_path: "x" }],
      },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("tts-results-table").getAttribute("data-show-metrics"),
    ).toBe("false");
  });

  it("calls onProviderSelect when a sidebar item is clicked", async () => {
    const user = setupUser();
    const onProviderSelect = jest.fn();
    const providerResults: TTSProviderResultForDetails[] = [
      { provider: "elevenlabs", success: true, results: [] },
      { provider: "azure-tts", success: true, results: [] },
    ];
    render(
      <TTSEvaluationOutputs
        {...baseProps}
        onProviderSelect={onProviderSelect}
        providerResults={providerResults}
      />,
    );
    await user.click(screen.getByTestId("sidebar-item-azure-tts"));
    expect(onProviderSelect).toHaveBeenCalledWith("azure-tts");
  });

  it("passes provider success straight through to the sidebar (no empty-prediction override)", () => {
    const providerResults: TTSProviderResultForDetails[] = [
      { provider: "elevenlabs", success: false, results: [] },
    ];
    render(
      <TTSEvaluationOutputs {...baseProps} providerResults={providerResults} />,
    );
    expect(
      screen.getByTestId("sidebar-item-elevenlabs").getAttribute("data-success"),
    ).toBe("false");
  });
});
