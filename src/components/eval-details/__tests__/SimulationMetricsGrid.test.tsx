import React from "react";
import { render, screen } from "@/test-utils";
import { setupUser } from "@/test-utils";
import {
  SimulationMetricsGrid,
  formatMetricCardValue,
  type MetricData,
} from "../SimulationMetricsGrid";

describe("formatMetricCardValue", () => {
  it("formats rating metrics as mean/scale_max", () => {
    const metric: MetricData = { mean: 4.567, std: 0, values: [], type: "rating", scale_max: 5 };
    expect(formatMetricCardValue(metric)).toBe("4.57/5");
  });

  it("formats binary/legacy metrics as a rounded percent", () => {
    const metric: MetricData = { mean: 0.756, std: 0, values: [] };
    expect(formatMetricCardValue(metric)).toBe("76%");
  });

  it("coerces a string mean defensively", () => {
    const metric = { mean: "0.5" as unknown as number, std: 0, values: [] };
    expect(formatMetricCardValue(metric)).toBe("50%");
  });

  it("falls back to 0 when mean is non-numeric", () => {
    const metric = { mean: "abc" as unknown as number, std: 0, values: [] };
    expect(formatMetricCardValue(metric)).toBe("0%");
  });

  it("treats rating without scale_max as legacy percent formatting", () => {
    const metric: MetricData = { mean: 0.5, std: 0, values: [], type: "rating" };
    expect(formatMetricCardValue(metric)).toBe("50%");
  });
});

describe("SimulationMetricsGrid", () => {
  it("returns null when metrics is null", () => {
    const { container } = render(<SimulationMetricsGrid metrics={null} type="voice" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("returns null when metrics has no usable entries", () => {
    const { container } = render(
      <SimulationMetricsGrid metrics={{ foo: undefined }} type="voice" />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders regular metric cards for text type without tabs", () => {
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="text" />);
    expect(screen.getByText("Overall Metrics")).toBeInTheDocument();
    expect(screen.getByText("accuracy")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
    expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    expect(screen.queryByText("Latency")).not.toBeInTheDocument();
  });

  it("renders performance/latency tabs for voice type and switches between them", async () => {
    const user = setupUser();
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
      "stt/ttft": { mean: 0.5, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="voice" />);

    expect(screen.getByText("Performance")).toBeInTheDocument();
    expect(screen.getByText("accuracy")).toBeInTheDocument();
    expect(screen.queryByText("stt/ttft")).not.toBeInTheDocument();

    await user.click(screen.getByText("Latency"));
    expect(screen.getByText("stt/ttft")).toBeInTheDocument();
    expect(screen.queryByText("accuracy")).not.toBeInTheDocument();

    await user.click(screen.getByText("Performance"));
    expect(screen.getByText("accuracy")).toBeInTheDocument();
    expect(screen.queryByText("stt/ttft")).not.toBeInTheDocument();
  });

  it("formats latency values under 1s as ms and >= 1s as seconds", async () => {
    const user = setupUser();
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
      "stt/ttft": { mean: 0.25, std: 0, values: [] },
      "llm/ttft": { mean: 2.5, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="voice" />);
    await user.click(screen.getByText("Latency"));
    expect(screen.getByText("250ms")).toBeInTheDocument();
    expect(screen.getByText("2.50s")).toBeInTheDocument();
  });

  it("does not render the latency panel content when there are no latency metrics", async () => {
    const user = setupUser();
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="voice" />);
    await user.click(screen.getByText("Latency"));
    expect(screen.queryByText("accuracy")).not.toBeInTheDocument();
  });

  it("renders evaluator cards as links with description tooltip when evaluatorUuidByName/description provided", () => {
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(
      <SimulationMetricsGrid
        metrics={metrics}
        type="text"
        evaluatorUuidByName={{ accuracy: "uuid-123" }}
        evaluatorDescriptionByName={{ accuracy: "Measures correctness" }}
      />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/evaluators/uuid-123");
  });

  it("renders a plain (non-link) card when no evaluatorUuid is provided for a metric", () => {
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="text" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("accuracy")).toBeInTheDocument();
  });
});
