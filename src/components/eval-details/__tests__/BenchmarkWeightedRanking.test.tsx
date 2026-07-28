import React from "react";
import { render, screen, fireEvent } from "@/test-utils";
import {
  BenchmarkWeightedRanking,
  scoreBandClass,
} from "../BenchmarkWeightedRanking";
import type {
  BenchmarkLeaderboardSummaryRow,
  BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

// Names of the ranked rows, top to bottom.
function rankedOrder(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("ol li")).map((li) => {
    // First .truncate div holds the (formatted) model name.
    const name = li.querySelector(".truncate");
    return name?.textContent?.trim() ?? "";
  });
}

describe("BenchmarkWeightedRanking", () => {
  it("renders the heading, three sliders, and four preset buttons", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "alpha", pass_rate: "95", cost: "0.05", latency_p50: "1000" },
      { model: "beta", pass_rate: "70", cost: "0.05", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "alpha" },
      { model: "beta" },
    ];

    render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    expect(screen.getByText("Rank by your priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Latency weight")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Quality first" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cheapest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Fastest" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Balanced" })).toBeInTheDocument();
  });

  it("renders one row per model, ordered by the quality-heavy default", () => {
    // Cost and latency identical across all three, so only pass_rate decides
    // the default order — unambiguous.
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gamma", pass_rate: "40", cost: "0.05", latency_p50: "1000" },
      { model: "alpha", pass_rate: "95", cost: "0.05", latency_p50: "1000" },
      { model: "beta", pass_rate: "70", cost: "0.05", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "gamma" },
      { model: "alpha" },
      { model: "beta" },
    ];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    expect(container.querySelectorAll("ol li")).toHaveLength(3);
    expect(rankedOrder(container)).toEqual(["alpha", "beta", "gamma"]);
  });

  it("re-sorts the ranking when the Cost slider is dragged to 100", () => {
    // A: best quality, worst cost. B: worst quality, best cost. Latency equal.
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
      { model: "model-b", pass_rate: "50", cost: "0.01", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "model-a" },
      { model: "model-b" },
    ];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    // Quality-heavy default → the high pass-rate model is first.
    expect(rankedOrder(container)[0]).toBe("model-a");

    // Weight cost to the max: the cheapest model must jump to rank 1.
    fireEvent.change(screen.getByLabelText("Cost weight"), {
      target: { value: "100" },
    });

    expect(rankedOrder(container)[0]).toBe("model-b");
  });

  it("re-orders toward the cheapest model when the Cheapest preset is clicked", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
      { model: "model-b", pass_rate: "50", cost: "0.01", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "model-a" },
      { model: "model-b" },
    ];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    expect(rankedOrder(container)[0]).toBe("model-a");

    fireEvent.click(screen.getByRole("button", { name: "Cheapest" }));

    expect(rankedOrder(container)[0]).toBe("model-b");
  });

  it("resets the weights to defaults when the available metrics change", () => {
    // model-a wins on quality, model-b wins on cost; latency equal.
    const models: BenchmarkModelLike[] = [
      { model: "model-a" },
      { model: "model-b" },
    ];
    const withLatency: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
      { model: "model-b", pass_rate: "50", cost: "0.01", latency_p50: "1000" },
    ];

    const { container, rerender } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={withLatency}
        modelResults={models}
      />,
    );

    // Push cost to the max so model-b leads, then change the metric set.
    fireEvent.change(screen.getByLabelText("Cost weight"), {
      target: { value: "100" },
    });
    expect(rankedOrder(container)[0]).toBe("model-b");

    // Drop latency from the run: the active dimensions change, so weights reset
    // to the quality-heavy default and model-a leads again.
    const withoutLatency: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10" },
      { model: "model-b", pass_rate: "50", cost: "0.01" },
    ];
    rerender(
      <BenchmarkWeightedRanking
        leaderboardSummary={withoutLatency}
        modelResults={models}
      />,
    );

    expect(screen.queryByLabelText("Latency weight")).not.toBeInTheDocument();
    expect(rankedOrder(container)[0]).toBe("model-a");
  });

  it("animates rows to their new position when the order changes", () => {
    // jsdom reports every offsetTop as 0, so the FLIP slide never fires. Feed
    // ever-changing tops so each re-measure differs from the stored one and the
    // transform branch runs.
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "offsetTop",
    );
    let tick = 0;
    Object.defineProperty(HTMLElement.prototype, "offsetTop", {
      configurable: true,
      get() {
        return (tick += 10);
      },
    });

    try {
      const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
        { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
        { model: "model-b", pass_rate: "50", cost: "0.01", latency_p50: "1000" },
      ];
      const modelResults: BenchmarkModelLike[] = [
        { model: "model-a" },
        { model: "model-b" },
      ];

      const { container } = render(
        <BenchmarkWeightedRanking
          leaderboardSummary={leaderboardSummary}
          modelResults={modelResults}
        />,
      );

      fireEvent.change(screen.getByLabelText("Cost weight"), {
        target: { value: "100" },
      });

      // A transform was applied to at least one row as it slid into place.
      const moved = Array.from(
        container.querySelectorAll<HTMLElement>("ol li[data-model]"),
      ).some((li) => li.style.transform !== "" || li.style.transition !== "");
      expect(moved).toBe(true);
      expect(rankedOrder(container)[0]).toBe("model-b");
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, "offsetTop", original);
      } else {
        delete (HTMLElement.prototype as unknown as { offsetTop?: unknown })
          .offsetTop;
      }
    }
  });

  it("colors the score bar by band, not by model", () => {
    expect(scoreBandClass(100)).toBe("bg-green-500");
    expect(scoreBandClass(70)).toBe("bg-green-500");
    expect(scoreBandClass(69)).toBe("bg-yellow-500");
    expect(scoreBandClass(50)).toBe("bg-yellow-500");
    expect(scoreBandClass(49)).toBe("bg-red-500");
    expect(scoreBandClass(0)).toBe("bg-red-500");

    // The rendered bars carry a band class and no inline model color.
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
      { model: "model-b", pass_rate: "50", cost: "0.01", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "model-a" },
      { model: "model-b" },
    ];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    const bars = container.querySelectorAll<HTMLElement>("ol li .bg-muted > div");
    expect(bars.length).toBe(2);
    bars.forEach((bar) => {
      expect(bar.className).toMatch(/bg-(green|yellow|red)-500/);
      expect(bar.style.backgroundColor).toBe("");
    });
  });

  it("renders nothing when only one metric is present", () => {
    // pass_rate only (no cost, no latency) → a single active dimension.
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90" },
      { model: "model-b", pass_rate: "50" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "model-a" },
      { model: "model-b" },
    ];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when there are fewer than two models", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "model-a", pass_rate: "90", cost: "0.10", latency_p50: "1000" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "model-a" }];

    const { container } = render(
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
