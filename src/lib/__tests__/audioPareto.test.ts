import {
  sttAccuracyPercent,
  ttsQualityPercent,
  buildSttParetoPoints,
  buildTtsParetoPoints,
  countValidParetoPoints,
} from "../audioPareto";

const label = (run: string) => `Provider ${run}`;

describe("sttAccuracyPercent", () => {
  it("derives accuracy from Semantic WER when present", () => {
    expect(sttAccuracyPercent({ run: "a", semantic_wer: 0.02 })).toBeCloseTo(98);
  });

  it("falls back to WER when Semantic WER is absent", () => {
    expect(sttAccuracyPercent({ run: "a", wer: 0.1 })).toBeCloseTo(90);
  });

  it("prefers Semantic WER over WER", () => {
    expect(
      sttAccuracyPercent({ run: "a", semantic_wer: 0.05, wer: 0.5 }),
    ).toBeCloseTo(95);
  });

  it("clamps to 0 when WER exceeds 1", () => {
    expect(sttAccuracyPercent({ run: "a", wer: 1.5 })).toBe(0);
  });

  it("returns null when neither metric is present", () => {
    expect(sttAccuracyPercent({ run: "a" })).toBeNull();
  });

  it("coerces string-encoded WER values", () => {
    expect(sttAccuracyPercent({ run: "a", wer: "0.1" })).toBeCloseTo(90);
  });
});

describe("ttsQualityPercent", () => {
  const binaryCol = { key: "nat", outputType: "binary" as const, scoreField: "nat" };
  const ratingCol = {
    key: "mos",
    outputType: "rating" as const,
    scoreField: "mos",
    scaleMax: 5,
  };

  it("scales a binary evaluator mean to a percentage", () => {
    expect(ttsQualityPercent({ run: "a", nat: 0.8 }, binaryCol)).toBeCloseTo(80);
  });

  it("normalizes a rating evaluator by its scale max", () => {
    expect(ttsQualityPercent({ run: "a", mos: 4 }, ratingCol)).toBeCloseTo(80);
  });

  it("returns null for a rating evaluator with no scale max", () => {
    expect(
      ttsQualityPercent({ run: "a", mos: 4 }, { key: "mos", outputType: "rating" }),
    ).toBeNull();
  });

  it("returns null when the value or column is missing", () => {
    expect(ttsQualityPercent({ run: "a" }, binaryCol)).toBeNull();
    expect(ttsQualityPercent({ run: "a", nat: 0.8 }, undefined)).toBeNull();
  });
});

describe("buildSttParetoPoints", () => {
  it("maps cost, accuracy and TTFS (as ms) per row", () => {
    const points = buildSttParetoPoints(
      [
        { run: "openai", cost_per_minute_usd: 0.004, semantic_wer: 0.02, ttfs: 0.4 },
        { run: "deepgram", cost_per_minute_usd: 0.002, wer: 0.1 },
      ],
      label,
    );
    expect(points[0]).toMatchObject({
      model: "openai",
      label: "Provider openai",
      cost: 0.004,
      latency: 400,
    });
    expect(points[0].passRate).toBeCloseTo(98);
    expect(points[1]).toMatchObject({ cost: 0.002, latency: undefined });
    expect(points[1].passRate).toBeCloseTo(90);
  });

  it("reads TTFS from the flattened ttfs_p50 headline", () => {
    const [p] = buildSttParetoPoints(
      [{ run: "a", cost_per_minute_usd: 0.004, wer: 0.1, ttfs_p50: 0.3 }],
      label,
    );
    expect(p.latency).toBe(300);
  });

  it("yields NaN cost/passRate when the row lacks them (filtered by the chart)", () => {
    const [p] = buildSttParetoPoints([{ run: "a" }], label);
    expect(Number.isNaN(p.cost)).toBe(true);
    expect(Number.isNaN(p.passRate)).toBe(true);
  });
});

describe("buildTtsParetoPoints", () => {
  const cols = [{ key: "nat", outputType: "binary" as const, scoreField: "nat" }];

  it("uses the primary evaluator for quality and TTFB (ms) for latency", () => {
    const [p] = buildTtsParetoPoints(
      [{ run: "eleven", cost_per_minute_usd: 0.01, nat: 0.9, ttfb_p50: 0.5 }],
      cols,
      label,
    );
    expect(p).toMatchObject({ model: "eleven", cost: 0.01, latency: 500 });
    expect(p.passRate).toBeCloseTo(90);
  });

  it("falls back to legacy flat ttfb", () => {
    const [p] = buildTtsParetoPoints(
      [{ run: "a", cost_per_minute_usd: 0.01, nat: 0.9, ttfb: 0.7 }],
      cols,
      label,
    );
    expect(p.latency).toBeCloseTo(700);
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
