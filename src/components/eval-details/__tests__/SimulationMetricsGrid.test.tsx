import React from "react";
import { render, screen, waitFor } from "@/test-utils";
import { setupUser } from "@/test-utils";
import {
  SimulationMetricsGrid,
  formatMetricCardValue,
  latencyMetricTooltip,
  formatLatency,
  type MetricData,
} from "../SimulationMetricsGrid";
import type { SimulationResult } from "../SimulationResultsTable";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// jsdom has no ResizeObserver; the prompt preview measures its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

const mockFetchEvaluatorDetail = fetchEvaluatorDetail as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchEvaluatorDetail.mockResolvedValue({
    uuid: "uuid-123",
    name: "accuracy",
    description: "Measures correctness",
    output_type: "rating",
    evaluator_type: "llm",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the reply is accurate.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

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

  it("offers no Latency tab when the run has no timings, and still shows the scores", () => {
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="voice" />);
    expect(screen.queryByText("Latency")).not.toBeInTheDocument();
    expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    expect(screen.getByText("accuracy")).toBeInTheDocument();
  });

  it("shows the timings with no tabs when the run has only those", () => {
    const metrics = {
      "llm/ttft": { mean: 0.25, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="voice" />);
    expect(screen.queryByText("Performance")).not.toBeInTheDocument();
    expect(screen.getByText("250ms")).toBeInTheDocument();
  });

  it("renders evaluator cards as buttons with description tooltip, and opens the evaluator preview on click", async () => {
    const user = setupUser();
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
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const card = screen.getByRole("button", { name: /accuracy/ });

    await user.click(card);

    expect(await screen.findByText("accuracy", { selector: "h2" })).toBeInTheDocument();
    await waitFor(() =>
      expect(mockFetchEvaluatorDetail).toHaveBeenCalledWith("uuid-123", "tok"),
    );
    expect(
      await screen.findByText("Judge whether the reply is accurate."),
    ).toBeInTheDocument();
  });

  it("renders a plain (non-link, non-button) card when no evaluatorUuid is provided for a metric", () => {
    const metrics = {
      accuracy: { mean: 0.9, std: 0, values: [] },
    };
    render(<SimulationMetricsGrid metrics={metrics} type="text" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("accuracy")).toBeInTheDocument();
  });
});

describe("latencyMetricTooltip", () => {
  it("spells out the part of the call and what was timed", () => {
    expect(latencyMetricTooltip("stt/ttft")).toBe("Time to first byte for speech to text");
    expect(latencyMetricTooltip("llm/processing_time")).toBe("Processing time for language model");
    expect(latencyMetricTooltip("tts/ttft")).toBe("Time to first byte for text to speech");
  });

  it("uses the raw name for a part it does not know", () => {
    expect(latencyMetricTooltip("webhook/ttft")).toBe("Time to first byte for webhook");
  });

  it("is empty for anything that is not a timing", () => {
    expect(latencyMetricTooltip("stt/accuracy")).toBe("");
  });
});

describe("SimulationMetricsGrid latency from the simulations", () => {
  const simulationWith = (value: number): SimulationResult => ({
    simulation_name: `sim-${value}`,
    persona: { label: "P", characteristics: "", gender: "f", language: "en" },
    scenario: { name: "S", description: "" },
    evaluation_results: [{ name: "llm/ttft", value, reasoning: "" }],
    transcript: [],
  });

  it("averages the latency from each simulation when the run carries none of its own", async () => {
    const user = setupUser();
    render(
      <SimulationMetricsGrid
        metrics={{ accuracy: { mean: 0.9, std: 0, values: [] } }}
        type="voice"
        simulations={[simulationWith(0.2), simulationWith(0.4)]}
      />,
    );
    await user.click(screen.getByText("Latency"));
    expect(screen.getByText("llm/ttft")).toBeInTheDocument();
    expect(screen.getByText("300ms")).toBeInTheDocument();
  });

  it("reads a timing sent as text, which is what the backend does", async () => {
    const user = setupUser();
    const asText = {
      ...simulationWith(0),
      evaluation_results: [
        { name: "llm/ttft", value: "2.0643304586410522" as unknown as number, reasoning: "" },
      ],
    };
    render(
      <SimulationMetricsGrid
        metrics={{ accuracy: { mean: 0.9, std: 0, values: [] } }}
        type="voice"
        simulations={[asText]}
      />,
    );
    await user.click(screen.getByText("Latency"));
    expect(screen.getByText("2.06s")).toBeInTheDocument();
  });

  it("leaves out a simulation that reported no timing rather than counting it as zero", async () => {
    const user = setupUser();
    const missing = {
      ...simulationWith(0),
      evaluation_results: [
        { name: "llm/ttft", value: null as unknown as number, reasoning: "" },
      ],
    };
    render(
      <SimulationMetricsGrid
        metrics={{ accuracy: { mean: 0.9, std: 0, values: [] } }}
        type="voice"
        simulations={[simulationWith(2), missing]}
      />,
    );
    await user.click(screen.getByText("Latency"));
    // The average of the one real timing, not of 2 and 0.
    expect(screen.getByText("2.00s")).toBeInTheDocument();
  });

  it("shows nothing at all for a text run whose only saved numbers are timings", () => {
    const { container } = render(
      <SimulationMetricsGrid
        metrics={{ "llm/ttft": { mean: 0.25, std: 0, values: [] } }}
        type="text"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("prefers the run's own latency numbers over the per-simulation ones", async () => {
    const user = setupUser();
    render(
      <SimulationMetricsGrid
        metrics={{
          accuracy: { mean: 0.9, std: 0, values: [] },
          "llm/ttft": { mean: 2.5, std: 0, values: [] },
        }}
        type="voice"
        simulations={[simulationWith(0.2)]}
      />,
    );
    await user.click(screen.getByText("Latency"));
    expect(screen.getByText("2.50s")).toBeInTheDocument();
    expect(screen.queryByText("200ms")).not.toBeInTheDocument();
  });

  it("shows nothing at all for a text run whose simulations carry timings", () => {
    const { container } = render(
      <SimulationMetricsGrid
        metrics={{}}
        type="text"
        simulations={[simulationWith(0.2)]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("explains the built-in speech-to-text score, which has no description of its own", async () => {
    const user = setupUser();
    const { container } = render(
      <SimulationMetricsGrid
        metrics={{ stt_llm_judge: { mean: 0.9, std: 0, values: [] } }}
        type="text"
      />,
    );
    await user.hover(container.querySelector("svg[aria-hidden]")!.parentElement!);
    expect(
      await screen.findByText(/speech to text accuracy for the text spoken by the simulated user/),
    ).toBeInTheDocument();
  });

  it("says what a latency card timed when the reader hovers it", async () => {
    const user = setupUser();
    const { container } = render(
      <SimulationMetricsGrid
        metrics={{
          accuracy: { mean: 0.9, std: 0, values: [] },
          "llm/ttft": { mean: 0.3, std: 0, values: [] },
        }}
        type="voice"
      />,
    );
    await user.click(screen.getByText("Latency"));
    await user.hover(container.querySelector("svg[aria-hidden]")!.parentElement!);
    expect(await screen.findByText("Time to first byte for language model")).toBeInTheDocument();
  });
});

describe("formatLatency", () => {
  it("shows under a second in milliseconds and above it in seconds", () => {
    expect(formatLatency(0.0337)).toBe("34ms");
    expect(formatLatency(1.923)).toBe("1.92s");
  });

  it("reads a timing sent as text", () => {
    expect(formatLatency("0.25" as unknown as number)).toBe("250ms");
  });

  it("shows a dash rather than NaN when the timing makes no sense", () => {
    expect(formatLatency("n/a" as unknown as number)).toBe("—");
  });
});
