import {
  computeParetoFrontier,
  orderFrontierByCost,
  type ParetoPoint,
} from "@/lib/paretoFrontier";

describe("computeParetoFrontier", () => {
  it("keeps a clearly non-dominated point and drops a dominated one", () => {
    // B is cheaper AND more accurate than C, so C is dominated.
    const points: ParetoPoint[] = [
      { model: "B", cost: 0.01, accuracy: 90 },
      { model: "C", cost: 0.02, accuracy: 80 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("B")).toBe(true);
    expect(frontier.has("C")).toBe(false);
  });

  it("keeps the cost/accuracy trade-off models on the frontier", () => {
    // Cheap-but-weaker and pricey-but-stronger both survive.
    const points: ParetoPoint[] = [
      { model: "cheap", cost: 0.005, accuracy: 70 },
      { model: "mid", cost: 0.01, accuracy: 85 },
      { model: "premium", cost: 0.05, accuracy: 95 },
      { model: "overpriced", cost: 0.06, accuracy: 85 }, // dominated by mid & premium
    ];
    const frontier = computeParetoFrontier(points);
    expect([...frontier].sort()).toEqual(["cheap", "mid", "premium"]);
  });

  it("keeps tied points (identical cost and accuracy)", () => {
    const points: ParetoPoint[] = [
      { model: "A", cost: 0.01, accuracy: 90 },
      { model: "B", cost: 0.01, accuracy: 90 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.size).toBe(2);
  });

  it("ignores points with non-finite objectives", () => {
    const points: ParetoPoint[] = [
      { model: "good", cost: 0.01, accuracy: 90 },
      { model: "nocost", cost: NaN, accuracy: 95 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("good")).toBe(true);
    expect(frontier.has("nocost")).toBe(false);
  });

  it("treats a cheaper-but-equal-accuracy model as dominating", () => {
    const points: ParetoPoint[] = [
      { model: "cheap", cost: 0.01, accuracy: 90 },
      { model: "same-score-pricier", cost: 0.02, accuracy: 90 },
    ];
    const frontier = computeParetoFrontier(points);
    expect(frontier.has("cheap")).toBe(true);
    expect(frontier.has("same-score-pricier")).toBe(false);
  });

  it("returns an empty set for no points", () => {
    expect(computeParetoFrontier([]).size).toBe(0);
  });
});

describe("orderFrontierByCost", () => {
  it("orders frontier points by ascending cost", () => {
    const points: ParetoPoint[] = [
      { model: "premium", cost: 0.05, accuracy: 95 },
      { model: "cheap", cost: 0.005, accuracy: 70 },
      { model: "mid", cost: 0.01, accuracy: 85 },
    ];
    const frontier = computeParetoFrontier(points);
    const ordered = orderFrontierByCost(points, frontier).map((p) => p.model);
    expect(ordered).toEqual(["cheap", "mid", "premium"]);
  });
});
