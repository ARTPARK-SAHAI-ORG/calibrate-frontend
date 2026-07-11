import React from "react";
import { render, screen } from "@/test-utils";
import { ProviderMetricsCard, type MetricItem } from "../ProviderMetricsCard";

describe("ProviderMetricsCard", () => {
  it("renders each metric label and value", () => {
    const metrics: MetricItem[] = [
      { label: "Accuracy", value: "95%" },
      { label: "Count", value: 42 },
    ];
    render(<ProviderMetricsCard metrics={metrics} />);

    expect(screen.getByText("Overall Metrics")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("Count")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("falls back to '-' when value is nullish", () => {
    const metrics: MetricItem[] = [
      { label: "Latency", value: undefined as unknown as string },
    ];
    render(<ProviderMetricsCard metrics={metrics} />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders a numeric zero value as-is (not '-')", () => {
    const metrics: MetricItem[] = [{ label: "Errors", value: 0 }];
    render(<ProviderMetricsCard metrics={metrics} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders an empty grid when metrics is empty", () => {
    render(<ProviderMetricsCard metrics={[]} />);
    expect(screen.getByText("Overall Metrics")).toBeInTheDocument();
  });
});
