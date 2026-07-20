import {
  readCost,
  readTotalCostUsd,
  formatMoney,
  costTiles,
  totalCostTile,
  unitCostTile,
  formatCaveatDate,
  costCaveats,
  aggregateCostCaveats,
  COST_CAVEAT_POINTS,
} from "../audioCost";

// Sample payloads mirroring the six backend shapes.
const sttMinuteUsd = {
  provider: "deepgram",
  pricing_model: "nova-3",
  billing_unit: "minute",
  total_seconds: 120,
  audio_minutes: 2,
  currency: "USD",
  cost_per_minute_currency: 0.0048,
  cost_usd: 0.0096,
};
const sttMinuteInr = {
  provider: "sarvam",
  billing_unit: "minute",
  currency: "INR",
  cost_per_minute_currency: 0.5,
  cost_in_currency: 1.0,
  conversion_rate: 96.35,
  cost_usd: 0.01038,
};
const ttsCharUsd = {
  provider: "groq",
  billing_unit: "character",
  total_characters: 500000,
  currency: "USD",
  cost_per_million_chars_currency: 22.0,
  cost_usd: 11.0,
};
const ttsCharInr = {
  provider: "sarvam",
  billing_unit: "character",
  currency: "INR",
  cost_per_million_chars_currency: 3000.0,
  cost_in_currency: 1500.0,
  conversion_rate: 96.35,
  cost_usd: 15.57,
};

describe("readCost / readTotalCostUsd", () => {
  it("reads a nested cost block", () => {
    expect(readCost({ wer: 0.1, cost: sttMinuteUsd })?.cost_usd).toBe(0.0096);
    expect(readTotalCostUsd({ cost: sttMinuteUsd })).toBe(0.0096);
  });

  it("reads a flattened cost object", () => {
    expect(readTotalCostUsd(sttMinuteInr)).toBeCloseTo(0.01038);
  });

  it("returns null when there is no cost", () => {
    expect(readCost({ wer: 0.1 })).toBeNull();
    expect(readTotalCostUsd({ wer: 0.1 })).toBeNull();
    expect(readTotalCostUsd(null)).toBeNull();
  });

  it("coerces a string-encoded cost_usd", () => {
    expect(readTotalCostUsd({ cost: { cost_usd: "0.5" } })).toBe(0.5);
  });
});

describe("formatMoney", () => {
  it("uses the right symbol and magnitude-scaled precision", () => {
    expect(formatMoney(0.0096, "USD")).toBe("$0.0096");
    expect(formatMoney(0.5, "INR")).toBe("₹0.5");
    expect(formatMoney(3000, "INR")).toBe("₹3000");
    expect(formatMoney(22, "USD")).toBe("$22");
    expect(formatMoney(0, "USD")).toBe("$0");
  });

  it("falls back to a currency-code prefix for unknown currencies", () => {
    expect(formatMoney(5, "EUR")).toBe("EUR 5");
  });

  it("returns an em dash for missing/non-finite", () => {
    expect(formatMoney(null)).toBe("—");
    expect(formatMoney(NaN)).toBe("—");
  });
});

describe("totalCostTile / unitCostTile", () => {
  it("STT minute USD → total + per-minute in USD", () => {
    expect(totalCostTile(sttMinuteUsd)).toEqual({ label: "Total cost", value: "$0.0096" });
    expect(unitCostTile(sttMinuteUsd)).toEqual({
      label: "Cost per minute",
      value: "$0.0048",
    });
  });

  it("STT minute INR → total in USD + per-minute in INR", () => {
    // 0.01038 USD rounds to 4dp (magnitude ≥ 0.01).
    expect(totalCostTile(sttMinuteInr)?.value).toBe("$0.0104");
    expect(unitCostTile(sttMinuteInr)).toEqual({
      label: "Cost per minute",
      value: "₹0.5",
    });
  });

  it("TTS character USD → per 1M characters in USD", () => {
    expect(unitCostTile(ttsCharUsd)).toEqual({
      label: "Cost per 1M characters",
      value: "$22",
    });
  });

  it("TTS character INR → per 1M characters in INR", () => {
    expect(unitCostTile(ttsCharInr)).toEqual({
      label: "Cost per 1M characters",
      value: "₹3000",
    });
  });

  it("returns null when the relevant field is missing", () => {
    expect(unitCostTile({ billing_unit: "minute", currency: "USD" })).toBeNull();
    expect(totalCostTile({ currency: "USD" })).toBeNull();
  });
});

describe("costTiles", () => {
  it("returns total + unit tiles from a nested cost block", () => {
    expect(costTiles({ wer: 0.1, cost: ttsCharUsd })).toEqual([
      { label: "Total cost", value: "$11" },
      { label: "Cost per 1M characters", value: "$22" },
    ]);
  });

  it("is empty when there is no cost", () => {
    expect(costTiles({ wer: 0.1 })).toEqual([]);
  });
});

describe("formatCaveatDate", () => {
  it("formats a run timestamp to a day/month/year", () => {
    expect(formatCaveatDate("2026-07-15 10:00:00")).toBe("Jul 15, 2026");
  });

  it("returns null for empty/invalid input", () => {
    expect(formatCaveatDate(null)).toBeNull();
    expect(formatCaveatDate("not-a-date")).toBeNull();
  });
});

describe("costCaveats", () => {
  it("leads with the general estimate points when cost is present", () => {
    const lines = costCaveats({ cost: sttMinuteUsd });
    expect(lines).toEqual(COST_CAVEAT_POINTS);
    expect(lines[0]).toMatch(/^Cost is an estimate/);
  });

  it("adds the FX-conversion caveat for a non-USD provider", () => {
    const lines = costCaveats(
      { cost: sttMinuteInr },
      { runDate: "2026-07-15 10:00:00" },
    );
    expect(lines).toContain(
      "For Sarvam, we convert from INR using the exchange rate on mid-Jul 2026 (₹96.35 = $1).",
    );
  });

  it("uses the same FX caveat regardless of run date", () => {
    const lines = costCaveats({ cost: ttsCharInr });
    expect(lines).toContain(
      "For Sarvam, we convert from INR using the exchange rate on mid-Jul 2026 (₹96.35 = $1).",
    );
    // General points plus the one FX line.
    expect(lines).toHaveLength(COST_CAVEAT_POINTS.length + 1);
  });

  it("has no FX caveat for USD providers", () => {
    const lines = costCaveats({ cost: ttsCharUsd });
    expect(lines).toEqual(COST_CAVEAT_POINTS);
  });

  it("falls back to a generic FX phrase when the rate is missing", () => {
    const lines = costCaveats({
      cost: { billing_unit: "minute", currency: "INR", cost_usd: 0.01 },
    });
    expect(lines[lines.length - 1]).toBe(
      "For Sarvam, we convert from INR using the exchange rate on mid-Jul 2026 (INR to USD).",
    );
  });

  it("returns [] when there is no cost", () => {
    expect(costCaveats({ wer: 0.1 })).toEqual([]);
  });
});

describe("aggregateCostCaveats", () => {
  it("returns [] when no provider has a cost", () => {
    expect(
      aggregateCostCaveats([{ metrics: { wer: 0.1 } }, { metrics: null }]),
    ).toEqual([]);
  });

  it("shows the general estimate points once across many costed providers", () => {
    const lines = aggregateCostCaveats([
      { metrics: { cost: { currency: "USD", cost_usd: 0.01 } } },
      { metrics: { cost: { currency: "USD", cost_usd: 0.02 } } },
    ]);
    expect(lines).toEqual(COST_CAVEAT_POINTS);
  });

  it("adds the FX line once when some provider needs it, without duplicating the points", () => {
    const lines = aggregateCostCaveats(
      [
        { metrics: { cost: { currency: "USD", cost_usd: 0.045 } } },
        {
          metrics: {
            cost: {
              currency: "INR",
              conversion_rate: 96.35,
              cost_usd: 0.01,
            },
          },
        },
      ],
      { runDate: "2026-07-15 10:00:00" },
    );
    expect(lines.slice(0, COST_CAVEAT_POINTS.length)).toEqual(COST_CAVEAT_POINTS);
    expect(lines).toContain(
      "For Sarvam, we convert from INR using the exchange rate on mid-Jul 2026 (₹96.35 = $1).",
    );
    // General points appear once, not once per provider.
    expect(lines.filter((l) => l === COST_CAVEAT_POINTS[0])).toHaveLength(1);
  });

  it("tolerates null/undefined provider lists", () => {
    expect(aggregateCostCaveats(null)).toEqual([]);
    expect(aggregateCostCaveats(undefined)).toEqual([]);
  });
});
