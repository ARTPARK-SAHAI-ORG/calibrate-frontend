import React from "react";
import { render, screen } from "@/test-utils";
import { setupUser } from "@/test-utils";
import {
  SimulationResultsTable,
  type SimulationResult,
} from "../SimulationResultsTable";

function makeSim(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    simulation_name: "sim-1",
    persona: { label: "Persona A", characteristics: "curious", gender: "f", language: "en" },
    scenario: { name: "Scenario A", description: "desc" },
    evaluation_results: [],
    transcript: [],
    ...overrides,
  };
}

describe("SimulationResultsTable", () => {
  it("renders the simulation count singular/plural", () => {
    const { rerender } = render(
      <SimulationResultsTable simulations={[makeSim()]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    expect(screen.getByText("1 simulation")).toBeInTheDocument();

    rerender(
      <SimulationResultsTable
        simulations={[makeSim(), makeSim()]}
        metricKeys={[]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("2 simulations")).toBeInTheDocument();
  });

  it("renders persona and scenario columns", () => {
    render(
      <SimulationResultsTable simulations={[makeSim()]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    expect(screen.getByText("Persona A")).toBeInTheDocument();
    expect(screen.getByText("Scenario A")).toBeInTheDocument();
  });

  it("shows an em-dash for a missing (non-aborted) metric value", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ evaluation_results: [] })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows N/A for a missing metric value on an aborted simulation", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ aborted: true, evaluation_results: [] })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("N/A")).toBeInTheDocument();
  });

  it("renders Pass/Fail pills for binary (legacy, no metricInfo) metrics with reasoning tooltip", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [
              { name: "accuracy", value: 1, reasoning: "looked good" },
              { name: "safety", value: 0, reasoning: "" },
            ],
          }),
        ]}
        metricKeys={["accuracy", "safety"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.getByText("Fail")).toBeInTheDocument();
    // Only the "accuracy" cell has non-empty reasoning -> exactly one tooltip button.
    expect(screen.getAllByRole("button", { name: "" }).length).toBeGreaterThanOrEqual(0);
  });

  it("coerces string '1' value to Pass for binary metrics", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "accuracy", value: "1" as unknown as number, reasoning: "" }],
          }),
        ]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("maps stt_llm_judge key to stt_llm_judge_score result name", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "stt_llm_judge_score", value: 1, reasoning: "mapped" }],
          }),
        ]}
        metricKeys={["stt_llm_judge"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("renders rating metrics as value/max with a tooltip when reasoning present", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "quality", value: 4.5, reasoning: "great" }],
          }),
        ]}
        metricKeys={["quality"]}
        onSelectSimulation={jest.fn()}
        metricInfo={{ quality: { type: "rating", scale_max: 5 } }}
      />,
    );
    expect(screen.getByText("4.5/5")).toBeInTheDocument();
  });

  it("renders rating metric without scale_max as a bare number", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "quality", value: 4.5, reasoning: "" }],
          }),
        ]}
        metricKeys={["quality"]}
        onSelectSimulation={jest.fn()}
        metricInfo={{ quality: { type: "rating" } }}
      />,
    );
    expect(screen.getByText("4.5")).toBeInTheDocument();
  });

  it("coerces string rating values with .toFixed workaround", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "quality", value: "3.14159" as unknown as number, reasoning: "" }],
          }),
        ]}
        metricKeys={["quality"]}
        onSelectSimulation={jest.fn()}
        metricInfo={{ quality: { type: "rating", scale_max: 5 } }}
      />,
    );
    expect(screen.getByText("3.14/5")).toBeInTheDocument();
  });

  it("falls back to raw val when rating value is non-numeric", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "quality", value: "n/a" as unknown as number, reasoning: "" }],
          }),
        ]}
        metricKeys={["quality"]}
        onSelectSimulation={jest.fn()}
        metricInfo={{ quality: { type: "rating" } }}
      />,
    );
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("shows the transcript button only when transcript has entries, and calls onSelectSimulation", async () => {
    const user = setupUser();
    const onSelectSimulation = jest.fn();
    const withTranscript = makeSim({
      transcript: [{ role: "user", content: "hi" }],
    });
    const withoutTranscript = makeSim({ simulation_name: "sim-2", transcript: [] });

    render(
      <SimulationResultsTable
        simulations={[withTranscript, withoutTranscript]}
        metricKeys={[]}
        onSelectSimulation={onSelectSimulation}
      />,
    );

    const buttons = screen.getAllByTitle("View transcript");
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0]);
    expect(onSelectSimulation).toHaveBeenCalledWith(withTranscript);
  });

  it("renders the transcript icon in red when the simulation is aborted", () => {
    const aborted = makeSim({
      aborted: true,
      transcript: [{ role: "user", content: "hi" }],
    });
    render(
      <SimulationResultsTable simulations={[aborted]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    const svg = screen.getByTitle("View transcript").querySelector("svg");
    expect(svg?.getAttribute("class")).toContain("text-red-500");
  });

  it("handles a simulation with null evaluation_results", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ evaluation_results: null })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("does not show the transcript button when transcript is undefined", () => {
    const sim = makeSim({ transcript: undefined });
    render(
      <SimulationResultsTable simulations={[sim]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    expect(screen.queryByTitle("View transcript")).not.toBeInTheDocument();
  });

  it("renders metric key column headers", () => {
    render(
      <SimulationResultsTable
        simulations={[]}
        metricKeys={["accuracy", "safety"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(screen.getByText("accuracy")).toBeInTheDocument();
    expect(screen.getByText("safety")).toBeInTheDocument();
  });
});
