import {
  computeParetoFrontier,
  orderFrontierByCost,
  type ParetoPoint,
} from "@/lib/paretoFrontier";

describe("computeParetoFrontier", () => {
  it("keeps a clearly non-dominated point and drops a dominated one", () => {
    // B is cheaper AND higher pass rate than C, so C is dominated.
    const points: ParetoPoint[] = [
      { model: "B", cost: 0.01, passRate: 90 },
      { model: "C", cost: 0.02, passRate: 80 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("B")).toBe(true);
    expect(frontier.has("C")).toBe(false);
  });

  it("keeps the cost/pass-rate trade-off models on the frontier", () => {
    // Cheap-but-weaker and pricey-but-stronger both survive.
    const points: ParetoPoint[] = [
      { model: "cheap", cost: 0.005, passRate: 70 },
      { model: "mid", cost: 0.01, passRate: 85 },
      { model: "premium", cost: 0.05, passRate: 95 },
      { model: "overpriced", cost: 0.06, passRate: 85 }, // dominated by mid & premium
    ];
    const frontier = computeParetoFrontier(points);
    expect([...frontier].sort()).toEqual(["cheap", "mid", "premium"]);
  });

  it("keeps tied points (identical objectives)", () => {
    const points: ParetoPoint[] = [
      { model: "A", cost: 0.01, passRate: 90 },
      { model: "B", cost: 0.01, passRate: 90 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.size).toBe(2);
  });

  it("ignores points with non-finite objectives", () => {
    const points: ParetoPoint[] = [
      { model: "good", cost: 0.01, passRate: 90 },
      { model: "nocost", cost: NaN, passRate: 95 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("good")).toBe(true);
    expect(frontier.has("nocost")).toBe(false);
  });

  it("treats a cheaper-but-equal-pass-rate model as dominating", () => {
    const points: ParetoPoint[] = [
      { model: "cheap", cost: 0.01, passRate: 90 },
      { model: "same-score-pricier", cost: 0.02, passRate: 90 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("cheap")).toBe(true);
    expect(frontier.has("same-score-pricier")).toBe(false);
  });

  it("keeps a 2D-dominated model that wins on latency (3rd objective)", () => {
    // "fast" is pricier and lower pass rate than "strong", so it would be
    // dominated on cost/pass-rate alone — but it's much faster, so it survives.
    const points: ParetoPoint[] = [
      { model: "strong", cost: 0.01, passRate: 90, latency: 3000 },
      { model: "fast", cost: 0.02, passRate: 85, latency: 300 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("strong")).toBe(true);
    expect(frontier.has("fast")).toBe(true);
  });

  it("still dominates when a model is worse on all three axes", () => {
    const points: ParetoPoint[] = [
      { model: "best", cost: 0.01, passRate: 90, latency: 300 },
      { model: "worst", cost: 0.02, passRate: 85, latency: 3000 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("best")).toBe(true);
    expect(frontier.has("worst")).toBe(false);
  });

  it("falls back to cost/pass-rate when latency is missing on a point", () => {
    const points: ParetoPoint[] = [
      { model: "B", cost: 0.01, passRate: 90, latency: 500 },
      { model: "C", cost: 0.02, passRate: 80 }, // no latency → 2D comparison
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("B")).toBe(true);
    expect(frontier.has("C")).toBe(false);
  });

  it("returns an empty set for no points", () => {
    expect(computeParetoFrontier([]).size).toBe(0);
  });
});

describe("orderFrontierByCost", () => {
  it("orders frontier points by ascending cost", () => {
    const points: ParetoPoint[] = [
      { model: "premium", cost: 0.05, passRate: 95 },
      { model: "cheap", cost: 0.005, passRate: 70 },
      { model: "mid", cost: 0.01, passRate: 85 },
    ];
    const frontier = computeParetoFrontier(points);
    const ordered = orderFrontierByCost(points, frontier).map((p) => p.model);
    expect(ordered).toEqual(["cheap", "mid", "premium"]);
  });
});
