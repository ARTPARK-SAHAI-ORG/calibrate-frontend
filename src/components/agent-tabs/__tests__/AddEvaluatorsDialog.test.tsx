import { render, screen } from "@/test-utils";
import { AddEvaluatorsDialog } from "../AddEvaluatorsDialog";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const evaluator = (over: Partial<EvaluatorData> = {}): EvaluatorData => ({
  uuid: over.uuid ?? "ev-1",
  name: over.name ?? "Evaluator",
  description: over.description ?? "Description",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: over.owner_user_id ?? "user-1",
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

describe("AddEvaluatorsDialog", () => {
  it("shows section headers when both default and custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            owner_user_id: null,
          }),
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Default")).toBeInTheDocument();
    expect(screen.getByText("My evaluators")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Tone check")).toBeInTheDocument();
  });

  it("hides section headers when only default evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-default",
            name: "Correctness",
            owner_user_id: null,
          }),
        ]}
      />,
    );

    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });

  it("hides section headers when only custom evaluators are available", () => {
    render(
      <AddEvaluatorsDialog
        isOpen
        onClose={jest.fn()}
        onAdd={jest.fn()}
        availableEvaluators={[
          evaluator({
            uuid: "ev-custom",
            name: "Tone check",
            owner_user_id: "user-1",
          }),
        ]}
      />,
    );

    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
  });
});
