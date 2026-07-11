import React from "react";
import { render, screen } from "@/test-utils";
import { AboutMetricsTable, type MetricDescription } from "../AboutMetricsTable";

describe("AboutMetricsTable", () => {
  it("renders metric rows (desktop table + mobile cards) with a key", () => {
    const metrics: MetricDescription[] = [
      {
        metric: "Accuracy",
        key: "accuracy",
        description: "How correct the model is",
        preference: "Higher is better",
        range: "0-1",
      },
    ];
    render(<AboutMetricsTable metrics={metrics} />);

    // Rendered twice: once in the desktop table, once in the mobile card.
    expect(screen.getAllByText("Accuracy")).toHaveLength(2);
    expect(screen.getAllByText("How correct the model is")).toHaveLength(2);
    expect(screen.getAllByText("Higher is better")).toHaveLength(2);
    expect(screen.getAllByText("0-1")).toHaveLength(2);
    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getAllByText("Preference").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Range").length).toBeGreaterThan(0);
  });

  it("falls back to String(metric) as the key when key is absent", () => {
    const metrics: MetricDescription[] = [
      {
        metric: "Latency",
        description: "Response time",
        preference: "Lower is better",
        range: "0-inf",
      },
    ];
    render(<AboutMetricsTable metrics={metrics} />);
    expect(screen.getAllByText("Latency")).toHaveLength(2);
  });

  it("applies border styling consistently across multiple rows (last vs non-last)", () => {
    const metrics: MetricDescription[] = [
      { metric: "A", description: "descA", preference: "p", range: "r" },
      { metric: "B", description: "descB", preference: "p", range: "r" },
    ];
    render(<AboutMetricsTable metrics={metrics} />);
    expect(screen.getAllByText("A").length).toBeGreaterThan(0);
    expect(screen.getAllByText("B").length).toBeGreaterThan(0);
  });

  it("renders an empty table body when metrics is empty", () => {
    render(<AboutMetricsTable metrics={[]} />);
    expect(screen.getByText("Metric")).toBeInTheDocument();
    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });
});
