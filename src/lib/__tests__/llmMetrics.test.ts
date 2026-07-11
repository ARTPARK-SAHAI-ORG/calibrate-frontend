import {
  latencyP50,
  latencySubtitle,
  formatLatencyMs,
  formatCostUsd,
  formatTokens,
  formatPercent,
  formatRating,
  METRIC_LABELS,
  type LatencyStat,
} from "@/lib/llmMetrics";

describe("METRIC_LABELS", () => {
  it("has the expected static labels", () => {
    expect(METRIC_LABELS).toEqual({
      latency: "Latency",
      cost: "Average cost",
      tokens: "Average tokens",
    });
  });
});

describe("latencyP50", () => {
  it("returns undefined when latency is undefined", () => {
    expect(latencyP50(undefined)).toBeUndefined();
  });

  it("returns undefined when latency is null", () => {
    expect(latencyP50(null)).toBeUndefined();
  });

  it("prefers p50 when present", () => {
    expect(latencyP50({ p50: 100, mean: 200, count: 1 })).toBe(100);
  });

  it("falls back to mean when p50 is absent", () => {
    expect(latencyP50({ mean: 200, count: 1 })).toBe(200);
  });

  it("returns undefined when neither p50 nor mean is present", () => {
    expect(latencyP50({ count: 1 })).toBeUndefined();
  });
});

describe("latencySubtitle", () => {
  it("returns undefined when latency is undefined", () => {
    expect(latencySubtitle(undefined)).toBeUndefined();
  });

  it("returns undefined when latency is null", () => {
    expect(latencySubtitle(null)).toBeUndefined();
  });

  it("returns undefined when count is 1 (single sample)", () => {
    expect(
      latencySubtitle({ p95: 100, p99: 200, count: 1 }),
    ).toBeUndefined();
  });

  it("returns undefined when count is 0", () => {
    expect(
      latencySubtitle({ p95: 100, p99: 200, count: 0 }),
    ).toBeUndefined();
  });

  it("renders both p95 and p99 when both present", () => {
    expect(
      latencySubtitle({ p95: 850, p99: 1230, count: 5 }),
    ).toBe("p95 850 ms · p99 1.23 s");
  });

  it("renders only p95 when p99 is missing", () => {
    expect(latencySubtitle({ p95: 500, count: 3 })).toBe("p95 500 ms");
  });

  it("renders only p99 when p95 is missing", () => {
    expect(latencySubtitle({ p99: 500, count: 3 })).toBe("p99 500 ms");
  });

  it("falls back to legacy min-max range when no percentiles and min !== max", () => {
    const latency: LatencyStat = { min: 100, max: 900, count: 4 };
    expect(latencySubtitle(latency)).toBe("100 ms – 900 ms");
  });

  it("returns undefined for legacy min === max", () => {
    const latency: LatencyStat = { min: 500, max: 500, count: 4 };
    expect(latencySubtitle(latency)).toBeUndefined();
  });

  it("returns undefined when no percentiles and no min/max", () => {
    expect(latencySubtitle({ count: 4 })).toBeUndefined();
  });

  it("returns undefined when only min is present (no max)", () => {
    expect(latencySubtitle({ min: 100, count: 4 })).toBeUndefined();
  });
});

describe("formatLatencyMs", () => {
  it("returns em dash for null", () => {
    expect(formatLatencyMs(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatLatencyMs(undefined)).toBe("—");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatLatencyMs(NaN)).toBe("—");
    expect(formatLatencyMs(Infinity)).toBe("—");
  });

  it("renders sub-second values as whole milliseconds", () => {
    expect(formatLatencyMs(850)).toBe("850 ms");
  });

  it("rounds fractional millisecond values", () => {
    expect(formatLatencyMs(850.6)).toBe("851 ms");
  });

  it("renders values >= 1000 as seconds with up to 2 decimals", () => {
    expect(formatLatencyMs(1230)).toBe("1.23 s");
  });

  it("drops trailing zeros for whole-second values", () => {
    expect(formatLatencyMs(2000)).toBe("2 s");
  });

  it("handles the exact boundary of 1000ms", () => {
    expect(formatLatencyMs(1000)).toBe("1 s");
  });
});

describe("formatCostUsd", () => {
  it("returns em dash for null", () => {
    expect(formatCostUsd(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatCostUsd(undefined)).toBe("—");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatCostUsd(NaN)).toBe("—");
  });

  it("returns $0 for exactly zero", () => {
    expect(formatCostUsd(0)).toBe("$0");
  });

  it("uses 2 decimals for values >= 1", () => {
    expect(formatCostUsd(2)).toBe("$2");
    expect(formatCostUsd(2.5)).toBe("$2.5");
    expect(formatCostUsd(1.005)).toBe("$1");
  });

  it("uses 4 decimals for values >= 0.01 and < 1", () => {
    expect(formatCostUsd(0.012345)).toBe("$0.0123");
  });

  it("uses 6 decimals for values < 0.01", () => {
    expect(formatCostUsd(0.0000123456)).toBe("$0.000012");
  });
});

describe("formatTokens", () => {
  it("returns em dash for null", () => {
    expect(formatTokens(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatTokens(undefined)).toBe("—");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatTokens(NaN)).toBe("—");
  });

  it("rounds and formats with thousands separators", () => {
    expect(formatTokens(1234.6)).toBe("1,235");
  });

  it("formats small numbers without separators", () => {
    expect(formatTokens(42)).toBe("42");
  });
});

describe("formatPercent", () => {
  it("returns em dash for null", () => {
    expect(formatPercent(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatPercent(undefined)).toBe("—");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatPercent(NaN)).toBe("—");
  });

  it("drops trailing zeros for whole values", () => {
    expect(formatPercent(100)).toBe("100%");
  });

  it("uses default 1 decimal place", () => {
    expect(formatPercent(33.456)).toBe("33.5%");
  });

  it("respects a custom decimals argument", () => {
    expect(formatPercent(33.456, 2)).toBe("33.46%");
  });
});

describe("formatRating", () => {
  it("returns em dash for null", () => {
    expect(formatRating(null)).toBe("—");
  });

  it("returns em dash for undefined", () => {
    expect(formatRating(undefined)).toBe("—");
  });

  it("returns em dash for non-finite input", () => {
    expect(formatRating(NaN)).toBe("—");
  });

  it("drops trailing zeros for whole values with default decimals", () => {
    expect(formatRating(4)).toBe("4");
  });

  it("uses default 2 decimal places", () => {
    expect(formatRating(4.1234)).toBe("4.12");
  });

  it("respects a custom decimals argument", () => {
    expect(formatRating(4.1234, 1)).toBe("4.1");
  });
});
