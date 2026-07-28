import {
  weightsFromTemplate,
  defaultWeights,
  rebalanceWeights,
  rankModelsByWeights,
  type RankingDimension,
} from "../benchmarkWeightedRanking";

const ALL: RankingDimension[] = ["quality", "cost", "latency"];

const sum = (w: Record<string, number | undefined>) =>
  Object.values(w).reduce((acc: number, v) => acc + (v || 0), 0);

describe("weightsFromTemplate / defaultWeights", () => {
  it("default weights over all three dims are integers summing to 100", () => {
    const w = defaultWeights(ALL);
    expect(w).toEqual({ quality: 50, cost: 30, latency: 20 });
    expect(sum(w)).toBe(100);
    Object.values(w).forEach((v) => expect(Number.isInteger(v)).toBe(true));
  });

  it("returns {} for an empty dim set", () => {
    expect(weightsFromTemplate({ quality: 1, cost: 1, latency: 1 }, [])).toEqual(
      {},
    );
  });

  it("drops the excluded dim and still sums to 100 over a 2-dim subset", () => {
    const w = defaultWeights(["quality", "cost"]);
    expect(w).toEqual({ quality: 63, cost: 37 });
    expect(w).not.toHaveProperty("latency");
    expect(sum(w)).toBe(100);
  });

  it("splits an all-equal template roughly evenly and sums to 100", () => {
    const w = weightsFromTemplate({ quality: 1, cost: 1, latency: 1 }, ALL);
    expect(w).toEqual({ quality: 34, cost: 33, latency: 33 });
    expect(sum(w)).toBe(100);
  });

  it("splits evenly when the template has no emphasis on the active dims", () => {
    const w = weightsFromTemplate({ quality: 0, cost: 0, latency: 0 }, ALL);
    expect(sum(w)).toBe(100);
    expect(w.quality).toBe(34);
    expect(w.cost).toBe(33);
    expect(w.latency).toBe(33);
  });
});

describe("rebalanceWeights", () => {
  it("keeps the sum at exactly 100 across several moved values", () => {
    for (const moved of [0, 25, 60, 100]) {
      const w = rebalanceWeights(
        { quality: moved, cost: 30, latency: 10 },
        "quality",
        ALL,
      );
      expect(sum(w)).toBe(100);
    }
  });

  it("zeroes the others when the moved dim goes to 100", () => {
    const w = rebalanceWeights(
      { quality: 100, cost: 30, latency: 10 },
      "quality",
      ALL,
    );
    expect(w).toEqual({ quality: 100, cost: 0, latency: 0 });
  });

  it("rescales the others proportionally to their prior ratio", () => {
    // others were 60 and 20 (ratio 3:1); moved leaves rest=40 -> 30 and 10.
    const w = rebalanceWeights(
      { quality: 60, cost: 60, latency: 20 },
      "quality",
      ALL,
    );
    expect(w).toEqual({ quality: 60, cost: 30, latency: 10 });
    expect(sum(w)).toBe(100);
  });

  it("splits the remainder evenly when the others were both zero", () => {
    const w = rebalanceWeights(
      { quality: 60, cost: 0, latency: 0 },
      "quality",
      ALL,
    );
    expect(w).toEqual({ quality: 60, cost: 20, latency: 20 });
  });

  it("sends the moved dim to 100 when it is the only dim", () => {
    expect(rebalanceWeights({ quality: 40 }, "quality", ["quality"])).toEqual({
      quality: 100,
    });
  });

  it("works for a 2-dim set", () => {
    const w = rebalanceWeights({ quality: 70, cost: 40 }, "quality", [
      "quality",
      "cost",
    ]);
    expect(w).toEqual({ quality: 70, cost: 30 });
    expect(sum(w)).toBe(100);
  });
});

describe("rankModelsByWeights", () => {
  // A wins on quality, B wins on cost and latency.
  const A = { model: "A", pass_rate: 90, avg_cost: 5, avg_latency_ms: 100 };
  const B = { model: "B", pass_rate: 70, avg_cost: 1, avg_latency_ms: 50 };

  it("ranks the highest pass_rate first under 100% quality", () => {
    const ranked = rankModelsByWeights(
      [A, B],
      { quality: 100, cost: 0, latency: 0 },
      ALL,
    );
    expect(ranked.map((r) => r.model)).toEqual(["A", "B"]);
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(0);
  });

  it("ranks the lowest avg_cost first under 100% cost (inverted)", () => {
    const ranked = rankModelsByWeights(
      [A, B],
      { quality: 0, cost: 100, latency: 0 },
      ALL,
    );
    expect(ranked.map((r) => r.model)).toEqual(["B", "A"]);
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(0);
  });

  it("ranks the lowest avg_latency_ms first under 100% latency (inverted)", () => {
    const ranked = rankModelsByWeights(
      [A, B],
      { quality: 0, cost: 0, latency: 100 },
      ALL,
    );
    expect(ranked.map((r) => r.model)).toEqual(["B", "A"]);
  });

  it("flips the order as the weights slide between quality and cost", () => {
    const qualityHeavy = rankModelsByWeights(
      [A, B],
      { quality: 80, cost: 20, latency: 0 },
      ALL,
    );
    expect(qualityHeavy[0].model).toBe("A");
    expect(qualityHeavy[0].rank).toBe(1);
    expect(qualityHeavy[0].score).toBe(80);
    expect(qualityHeavy[1].score).toBe(20);

    const costHeavy = rankModelsByWeights(
      [A, B],
      { quality: 20, cost: 80, latency: 0 },
      ALL,
    );
    expect(costHeavy[0].model).toBe("B");
    expect(costHeavy[0].rank).toBe(1);
    expect(costHeavy[0].score).toBe(80);
    expect(costHeavy[1].score).toBe(20);
  });

  it("scores a model missing a metric over only the dims it has, without crashing", () => {
    const C = { model: "C", pass_rate: 80, avg_latency_ms: 80 }; // no avg_cost
    const ranked = rankModelsByWeights(
      [A, B, C],
      { quality: 50, cost: 30, latency: 20 },
      ALL,
    );
    expect(ranked.map((r) => r.model)).toEqual(["A", "B", "C"]);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    const c = ranked.find((r) => r.model === "C")!;
    expect(Number.isFinite(c.score)).toBe(true);
    // Renormalized over quality (25) + latency (8) out of weight 70 -> 47.14.
    expect(c.score).toBeCloseTo(47.142857, 3);
  });

  it("treats an all-equal dimension as normalized to 1 without breaking scoring", () => {
    const M1 = { model: "M1", pass_rate: 50, avg_cost: 1, avg_latency_ms: 10 };
    const M2 = { model: "M2", pass_rate: 50, avg_cost: 2, avg_latency_ms: 20 };
    const ranked = rankModelsByWeights(
      [M1, M2],
      { quality: 100, cost: 0, latency: 0 },
      ALL,
    );
    // Equal pass_rate -> both score 100, tie keeps input order.
    expect(ranked[0].model).toBe("M1");
    expect(ranked[1].model).toBe("M2");
    expect(ranked[0].score).toBe(100);
    expect(ranked[1].score).toBe(100);
  });

  it("assigns 1-based sequential ranks", () => {
    const ranked = rankModelsByWeights(
      [
        { model: "x", pass_rate: 10, avg_cost: 1, avg_latency_ms: 1 },
        { model: "y", pass_rate: 20, avg_cost: 2, avg_latency_ms: 2 },
        { model: "z", pass_rate: 30, avg_cost: 3, avg_latency_ms: 3 },
      ],
      { quality: 100, cost: 0, latency: 0 },
      ALL,
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
  });

  it("returns an empty array for no rows", () => {
    expect(rankModelsByWeights([], defaultWeights(ALL), ALL)).toEqual([]);
  });
});
