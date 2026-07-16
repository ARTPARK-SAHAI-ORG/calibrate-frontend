import {
  readCostPerMinuteUsd,
  costByRunFromProviders,
  COST_PER_MINUTE_KEY,
  COST_PER_MINUTE_LABEL,
} from "../audioCost";

describe("readCostPerMinuteUsd", () => {
  it("reads the nested cost block shape", () => {
    expect(
      readCostPerMinuteUsd({
        wer: 0.1,
        cost: { provider: "cartesia", cost_per_minute_usd: 0.0021666667 },
      }),
    ).toBeCloseTo(0.0021666667);
  });

  it("reads a flattened cost_per_minute_usd", () => {
    expect(readCostPerMinuteUsd({ cost_per_minute_usd: 0.005 })).toBe(0.005);
  });

  it("prefers the flattened value over the nested block", () => {
    expect(
      readCostPerMinuteUsd({
        cost_per_minute_usd: 0.005,
        cost: { cost_per_minute_usd: 0.009 },
      }),
    ).toBe(0.005);
  });

  it("coerces string-encoded numbers", () => {
    expect(readCostPerMinuteUsd({ cost: { cost_per_minute_usd: "0.0032" } })).toBe(
      0.0032,
    );
  });

  it("returns null when no cost is present", () => {
    expect(readCostPerMinuteUsd({ wer: 0.1 })).toBeNull();
    expect(readCostPerMinuteUsd({ cost: {} })).toBeNull();
    expect(readCostPerMinuteUsd(null)).toBeNull();
    expect(readCostPerMinuteUsd(undefined)).toBeNull();
    expect(readCostPerMinuteUsd("nope")).toBeNull();
  });

  it("ignores non-finite / non-numeric values", () => {
    expect(readCostPerMinuteUsd({ cost_per_minute_usd: NaN })).toBeNull();
    expect(readCostPerMinuteUsd({ cost: { cost_per_minute_usd: "abc" } })).toBeNull();
  });
});

describe("costByRunFromProviders", () => {
  it("maps each provider with a cost to its per-minute value", () => {
    expect(
      costByRunFromProviders([
        { provider: "openai", metrics: { cost: { cost_per_minute_usd: 0.004 } } },
        { provider: "cartesia", metrics: { cost_per_minute_usd: 0.002 } },
      ]),
    ).toEqual({ openai: 0.004, cartesia: 0.002 });
  });

  it("omits providers without a computed cost", () => {
    expect(
      costByRunFromProviders([
        { provider: "openai", metrics: { wer: 0.1 } },
        { provider: "deepgram", metrics: null },
      ]),
    ).toEqual({});
  });

  it("tolerates null / undefined input", () => {
    expect(costByRunFromProviders(null)).toEqual({});
    expect(costByRunFromProviders(undefined)).toEqual({});
  });
});

describe("cost constants", () => {
  it("expose the shared key and label", () => {
    expect(COST_PER_MINUTE_KEY).toBe("cost_per_minute_usd");
    expect(COST_PER_MINUTE_LABEL).toBe("Cost (USD/min)");
  });
});
