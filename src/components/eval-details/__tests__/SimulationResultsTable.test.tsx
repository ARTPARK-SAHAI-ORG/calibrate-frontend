import React from "react";
import { render, screen, within } from "@/test-utils";
import { setupUser } from "@/test-utils";
import {
  SimulationResultsTable,
  isSimulationLabellable,
  scoreBadge,
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

// The component draws the same rows twice: a table for wide screens and a
// card list for phones. Tests that assert on one cell look inside the table.
const table = () => within(document.querySelector("table") as HTMLElement);
const cards = () => within(document.querySelector(".md\\:hidden") as HTMLElement);

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

  it("renders persona and scenario in both the table and the phone cards", () => {
    render(
      <SimulationResultsTable simulations={[makeSim()]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    expect(table().getByText("Persona A")).toBeInTheDocument();
    expect(table().getByText("Scenario A")).toBeInTheDocument();
    expect(cards().getByText("Persona A")).toBeInTheDocument();
    expect(cards().getByText("Scenario A")).toBeInTheDocument();
  });

  it("shows an em-dash when the run finished but this evaluator scored nothing", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ evaluation_results: [{ name: "other", value: 1, reasoning: "" }] })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(table().getByText("—")).toBeInTheDocument();
  });

  it("shows N/A for a missing metric value on an aborted simulation", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ aborted: true, evaluation_results: [] })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(table().getByText("N/A")).toBeInTheDocument();
  });

  it("spins instead of scoring while a simulation is still being judged", () => {
    const { container } = render(
      <SimulationResultsTable
        simulations={[
          makeSim({ evaluation_results: null, transcript: [{ role: "user", content: "hi" }] }),
        ]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(table().queryByText("—")).not.toBeInTheDocument();
    expect(table().queryByText("Fail")).not.toBeInTheDocument();
    expect(container.querySelectorAll("svg.animate-spin.text-yellow-500").length).toBeGreaterThan(0);
  });

  it("spins in grey for a simulation that has not started talking", () => {
    const { container } = render(
      <SimulationResultsTable
        simulations={[makeSim({ evaluation_results: null, transcript: [] })]}
        metricKeys={["accuracy"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(container.querySelectorAll("svg.animate-spin.text-gray-500").length).toBeGreaterThan(0);
  });

  it("renders Pass/Fail pills for binary (legacy, no metricInfo) metrics", () => {
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
    expect(table().getByText("Pass")).toBeInTheDocument();
    expect(table().getByText("Fail")).toBeInTheDocument();
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
    expect(table().getByText("Pass")).toBeInTheDocument();
  });

  it("shows the speech-to-text judge score as a percentage, reading the _score result name", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({
            evaluation_results: [{ name: "stt_llm_judge_score", value: 0.9231, reasoning: "mapped" }],
          }),
        ]}
        metricKeys={["stt_llm_judge"]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(table().getByText("92.31%")).toBeInTheDocument();
  });

  it("renders rating metrics as value/max", () => {
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
    expect(table().getByText("4.5/5")).toBeInTheDocument();
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
    expect(table().getByText("4.5")).toBeInTheDocument();
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
    expect(table().getByText("3.14/5")).toBeInTheDocument();
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
    expect(table().getByText("n/a")).toBeInTheDocument();
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

  it("opens the transcript from the phone card too", async () => {
    const user = setupUser();
    const onSelectSimulation = jest.fn();
    const sim = makeSim({ transcript: [{ role: "user", content: "hi" }] });
    render(
      <SimulationResultsTable
        simulations={[sim]}
        metricKeys={[]}
        onSelectSimulation={onSelectSimulation}
      />,
    );
    await user.click(cards().getByText("View Transcript"));
    expect(onSelectSimulation).toHaveBeenCalledWith(sim);
  });

  it("says a phone card is still processing while the scores are pending", () => {
    render(
      <SimulationResultsTable
        simulations={[
          makeSim({ evaluation_results: null, transcript: [{ role: "user", content: "hi" }] }),
        ]}
        metricKeys={[]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(cards().getByText("Processing...")).toBeInTheDocument();
  });

  it("tells the reader on a phone when a simulation was stopped before it said anything", () => {
    render(
      <SimulationResultsTable
        simulations={[makeSim({ aborted: true, transcript: [] })]}
        metricKeys={[]}
        onSelectSimulation={jest.fn()}
      />,
    );
    expect(cards().getByText("Simulation aborted by user")).toBeInTheDocument();
  });

  it("renders the transcript button in red when the simulation is aborted", () => {
    const aborted = makeSim({
      aborted: true,
      transcript: [{ role: "user", content: "hi" }],
    });
    render(
      <SimulationResultsTable simulations={[aborted]} metricKeys={[]} onSelectSimulation={jest.fn()} />,
    );
    expect(screen.getByTitle("View transcript").getAttribute("class")).toContain("text-red-500");
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
    expect(table().getByText("accuracy")).toBeInTheDocument();
    expect(table().getByText("safety")).toBeInTheDocument();
  });

  it("shows finished simulations first, then the ones still talking, then the ones not started", () => {
    const notStarted = makeSim({
      simulation_name: "not-started",
      persona: { label: "Not started", characteristics: "", gender: "f", language: "en" },
      evaluation_results: null,
      transcript: [],
    });
    const talking = makeSim({
      simulation_name: "talking",
      persona: { label: "Talking", characteristics: "", gender: "f", language: "en" },
      evaluation_results: null,
      transcript: [{ role: "user", content: "hi" }],
    });
    const finished = makeSim({
      simulation_name: "finished",
      persona: { label: "Finished", characteristics: "", gender: "f", language: "en" },
      evaluation_results: [{ name: "accuracy", value: 1, reasoning: "" }],
    });
    render(
      <SimulationResultsTable
        simulations={[notStarted, talking, finished]}
        metricKeys={[]}
        onSelectSimulation={jest.fn()}
      />,
    );
    const rows = document.querySelectorAll("tbody tr");
    expect(rows[0].textContent).toContain("Finished");
    expect(rows[1].textContent).toContain("Talking");
    expect(rows[2].textContent).toContain("Not started");
  });

  describe("labelling selection", () => {
    const labellable = makeSim({
      simulation_name: "labellable",
      transcript: [{ role: "user", content: "hi" }],
    });
    const abortedSim = makeSim({
      simulation_name: "aborted",
      aborted: true,
      transcript: [{ role: "user", content: "hi" }],
    });

    it("renders no checkbox column when the caller passes no selection handlers", () => {
      render(
        <SimulationResultsTable
          simulations={[labellable]}
          metricKeys={[]}
          onSelectSimulation={jest.fn()}
        />,
      );
      expect(screen.queryByLabelText("Select for labelling")).not.toBeInTheDocument();
    });

    it("ticks a row using its original position, not its position on screen", async () => {
      const user = setupUser();
      const onToggle = jest.fn();
      // `labellable` is second in the data but sorts first on screen,
      // because the other one has no scores yet.
      const stillRunning = makeSim({
        simulation_name: "still-running",
        evaluation_results: null,
        transcript: [{ role: "user", content: "hi" }],
      });
      const finished = makeSim({
        simulation_name: "finished",
        evaluation_results: [{ name: "accuracy", value: 1, reasoning: "" }],
        transcript: [{ role: "user", content: "hi" }],
      });
      render(
        <SimulationResultsTable
          simulations={[stillRunning, finished]}
          metricKeys={[]}
          onSelectSimulation={jest.fn()}
          labellingSelection={new Set()}
          onToggleLabellingSelection={onToggle}
          labellingKeyForRow={(_sim, index) => String(index)}
        />,
      );
      await user.click(screen.getAllByLabelText("Select for labelling")[0]);
      expect(onToggle).toHaveBeenCalledWith("1");
    });

    it("cannot tick an aborted simulation", () => {
      render(
        <SimulationResultsTable
          simulations={[abortedSim]}
          metricKeys={[]}
          onSelectSimulation={jest.fn()}
          labellingSelection={new Set()}
          onToggleLabellingSelection={jest.fn()}
          labellingKeyForRow={(_sim, index) => String(index)}
        />,
      );
      expect(screen.getByLabelText("Select for labelling")).toBeDisabled();
    });

    it("select all ticks every simulation that can be labelled", async () => {
      const user = setupUser();
      const onBulkToggle = jest.fn();
      render(
        <SimulationResultsTable
          simulations={[labellable, abortedSim]}
          metricKeys={[]}
          onSelectSimulation={jest.fn()}
          labellingSelection={new Set()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onBulkToggle}
          labellingKeyForRow={(_sim, index) => String(index)}
        />,
      );
      await user.click(screen.getByLabelText("Select all"));
      expect(onBulkToggle).toHaveBeenCalledWith(["0"]);
    });
  });

  describe("isSimulationLabellable", () => {
    it("accepts a simulation with a real turn", () => {
      expect(isSimulationLabellable(makeSim({ transcript: [{ role: "user", content: "hi" }] }))).toBe(true);
    });

    it("rejects an aborted simulation", () => {
      expect(
        isSimulationLabellable(makeSim({ aborted: true, transcript: [{ role: "user", content: "hi" }] })),
      ).toBe(false);
    });

    it("rejects a transcript that only carries the end marker", () => {
      expect(
        isSimulationLabellable(makeSim({ transcript: [{ role: "end_reason", content: "max_turns" }] })),
      ).toBe(false);
    });
  });

  describe("scoreBadge", () => {
    it("keeps a percentage for the speech-to-text judge whatever the metric type says", () => {
      expect(scoreBadge("stt_llm_judge_score", 0.5, { type: "rating", scale_max: 5 }).text).toBe("50%");
    });

    it("falls back to the raw value for a percentage that is not a number", () => {
      expect(scoreBadge("stt_llm_judge", "n/a" as unknown as number, undefined).text).toBe("n/a");
    });
  });
});
