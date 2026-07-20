import {
  evaluatorScorePercent,
  sttQualityMetrics,
  ttsQualityMetrics,
  buildAudioParetoPoints,
  countValidParetoPoints,
  formatErrorRate,
  type AudioQualityMetric,
} from "../audioPareto";

describe("formatErrorRate", () => {
  it("shows a plain number and trims trailing zeros", () => {
    expect(formatErrorRate(0.05)).toBe("0.05");
    expect(formatErrorRate(0.283)).toBe("0.283");
    expect(formatErrorRate(0)).toBe("0");
    expect(formatErrorRate(1.5)).toBe("1.5");
  });
});

const label = (run: string) => `Provider ${run}`;

describe("evaluatorScorePercent", () => {
  const binaryCol = {
    key: "nat",
    label: "Naturalness",
    outputType: "binary" as const,
    scoreField: "nat",
  };
  const ratingCol = {
    key: "mos",
    label: "MOS",
    outputType: "rating" as const,
    scoreField: "mos",
    scaleMax: 5,
  };

  it("scales a binary evaluator mean to a percentage", () => {
    expect(evaluatorScorePercent({ run: "a", nat: 0.8 }, binaryCol)).toBeCloseTo(
      80,
    );
  });

  it("normalizes a rating evaluator by its scale max", () => {
    expect(evaluatorScorePercent({ run: "a", mos: 4 }, ratingCol)).toBeCloseTo(
      80,
    );
  });

  it("returns null for a rating evaluator with no scale max", () => {
    expect(
      evaluatorScorePercent(
        { run: "a", mos: 4 },
        { key: "mos", label: "MOS", outputType: "rating" },
      ),
    ).toBeNull();
  });

  it("returns null when the value is missing", () => {
    expect(evaluatorScorePercent({ run: "a" }, binaryCol)).toBeNull();
  });
});

describe("sttQualityMetrics", () => {
  const rows = [
    { run: "openai", cost_usd: 0.004, semantic_wer: 0.02, wer: 0.05, judge_score: 0.9 },
    { run: "deepgram", cost_usd: 0.002, semantic_wer: 0.15, wer: 0.2, judge_score: 0.7 },
  ];
  const judgeCol = {
    key: "judge",
    label: "Correctness",
    outputType: "binary" as const,
  };

  it("offers each error rate (as accuracy), then each judge, named plainly", () => {
    const metrics = sttQualityMetrics(rows, [judgeCol]);
    expect(metrics.map((m) => m.id)).toEqual([
      "semantic_wer",
      "wer",
      "judge:judge",
    ]);
    // Both the dropdown option and the axis use the plain metric name.
    expect(metrics[0].label).toBe("Semantic WER");
    expect(metrics[2].label).toBe("Correctness");
  });

  it("ranks error rates by accuracy but shows the raw rate", () => {
    const [semantic] = sttQualityMetrics(rows, []);
    // Ranking value is accuracy (higher is better)...
    expect(semantic.score(rows[0])).toBeCloseTo(98);
    // ...but the user-facing value is the raw error rate.
    expect(semantic.display).toBe("raw");
    expect(semantic.rawValue!(rows[0])).toBeCloseTo(0.02);
  });

  it("shows judges as a percentage, not a raw value", () => {
    const judge = sttQualityMetrics(rows, [judgeCol]).find(
      (m) => m.id === "judge:judge",
    )!;
    expect(judge.display).toBe("percent");
    expect(judge.rawValue).toBeUndefined();
  });

  it("includes Sarvam metrics: LLM-WER/LLM-CER as accuracy, Intent/Entity as scores", () => {
    const sarvamRows = [
      {
        run: "openai",
        cost_usd: 0.004,
        sarvam_llm_wer: 0.1,
        sarvam_intent_score: 0.9,
        sarvam_entity_score: 0.8,
      },
      {
        run: "deepgram",
        cost_usd: 0.002,
        sarvam_llm_wer: 0.2,
        sarvam_intent_score: 0.7,
        sarvam_entity_score: 0.6,
      },
    ];
    const metrics = sttQualityMetrics(sarvamRows, []);
    const byId = Object.fromEntries(metrics.map((m) => [m.id, m]));
    // LLM-WER is an error rate → accuracy.
    expect(byId["sarvam_llm_wer"].label).toBe("LLM-WER");
    expect(byId["sarvam_llm_wer"].score(sarvamRows[0])).toBeCloseTo(90);
    // Intent Score is a 0–1 fraction → percentage.
    expect(byId["sarvam_intent_score"].label).toBe("Intent Score");
    expect(byId["sarvam_intent_score"].score(sarvamRows[0])).toBeCloseTo(90);
    expect(byId["sarvam_entity_score"].score(sarvamRows[1])).toBeCloseTo(60);
  });

  it("derives accuracy as 1 − error rate", () => {
    const [semantic] = sttQualityMetrics(rows, []);
    expect(semantic.score(rows[0])).toBeCloseTo(98);
    expect(semantic.score(rows[1])).toBeCloseTo(85);
  });

  it("drops a metric that fewer than two providers can plot", () => {
    // Only one provider has a cost, so nothing is plottable.
    const metrics = sttQualityMetrics(
      [
        { run: "openai", cost_usd: 0.004, semantic_wer: 0.02 },
        { run: "deepgram", semantic_wer: 0.15 },
      ],
      [],
    );
    expect(metrics).toHaveLength(0);
  });
});

describe("ttsQualityMetrics", () => {
  const rows = [
    { run: "eleven", cost_usd: 0.01, nat: 0.9, clar: 0.8 },
    { run: "azure", cost_usd: 0.006, nat: 0.7, clar: 0.6 },
  ];
  const cols = [
    { key: "nat", label: "Naturalness", outputType: "binary" as const, scoreField: "nat" },
    { key: "clar", label: "Clarity", outputType: "binary" as const, scoreField: "clar" },
  ];

  it("offers one metric per judge with data", () => {
    const metrics = ttsQualityMetrics(rows, cols);
    expect(metrics.map((m) => m.label)).toEqual(["Naturalness", "Clarity"]);
  });

  it("offers nothing when there is no judge", () => {
    expect(ttsQualityMetrics(rows, [])).toHaveLength(0);
  });
});

describe("buildAudioParetoPoints", () => {
  const metric: AudioQualityMetric = {
    id: "semantic_wer",
    label: "Semantic WER",
    qualityNoun: "accuracy",
    qualityComparative: "how accurate it is",
    display: "raw",
    rawValue: (row) =>
      typeof row.semantic_wer === "number" ? row.semantic_wer : null,
    score: (row) => {
      const v = row.semantic_wer;
      return typeof v === "number" ? (1 - v) * 100 : null;
    },
  };

  it("maps cost, the chosen metric and STT TTFS (as ms) per row", () => {
    const points = buildAudioParetoPoints(
      [
        { run: "openai", cost_usd: 0.004, semantic_wer: 0.02, ttfs: 0.4 },
        { run: "deepgram", cost_usd: 0.002, semantic_wer: 0.1 },
      ],
      label,
      metric,
      "stt",
    );
    expect(points[0]).toMatchObject({
      model: "openai",
      label: "Provider openai",
      cost: 0.004,
      latency: 400,
    });
    expect(points[0].passRate).toBeCloseTo(98);
    // The raw error rate rides along for display (position/rank stays accuracy).
    expect(points[0].qualityDisplay).toBeCloseTo(0.02);
    expect(points[1]).toMatchObject({ cost: 0.002, latency: undefined });
  });

  it("reads TTS TTFB (ms) for latency", () => {
    const [p] = buildAudioParetoPoints(
      [{ run: "eleven", cost_usd: 0.01, semantic_wer: 0.05, ttfb_p50: 0.5 }],
      label,
      metric,
      "tts",
    );
    expect(p.latency).toBe(500);
  });

  it("yields NaN cost/passRate when the row lacks them (filtered by the chart)", () => {
    const [p] = buildAudioParetoPoints([{ run: "a" }], label, metric, "stt");
    expect(Number.isNaN(p.cost)).toBe(true);
    expect(Number.isNaN(p.passRate)).toBe(true);
  });
});

describe("countValidParetoPoints", () => {
  it("counts points with both a finite cost and quality", () => {
    const points = [
      { model: "a", label: "a", cost: 0.004, passRate: 90 },
      { model: "b", label: "b", cost: NaN, passRate: 80 },
      { model: "c", label: "c", cost: 0.002, passRate: NaN },
      { model: "d", label: "d", cost: 0.003, passRate: 70 },
    ];
    expect(countValidParetoPoints(points)).toBe(2);
  });
});
