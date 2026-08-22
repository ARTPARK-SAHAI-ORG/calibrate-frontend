import React from "react";
import { render, screen } from "@/test-utils";
import SimulationEvaluatorsPage from "../page";

// The page chrome is not under test — render children straight through.
jest.mock("../../../../components/AppLayout", () => ({
  AppLayout: ({
    children,
    activeItem,
  }: {
    children: React.ReactNode;
    activeItem: string;
  }) => (
    <>
      <span data-testid="active-item">{activeItem}</span>
      {children}
    </>
  ),
  useHideFloatingButton: () => {},
}));

// The list itself has its own tests; here we only check what the page asks for.
jest.mock("../../../../components/evaluations/EvaluatorLibraryPanel", () => ({
  EvaluatorLibraryPanel: ({
    evaluatorTypes,
    title,
  }: {
    evaluatorTypes: string[];
    title?: string;
  }) => (
    <div
      data-testid="evaluator-library"
      data-kinds={evaluatorTypes.join(",")}
      data-title={title}
    />
  ),
}));

it("shows the conversation evaluators and marks the sidebar entry", () => {
  render(<SimulationEvaluatorsPage />);

  expect(screen.getByTestId("evaluator-library")).toHaveAttribute(
    "data-title",
    "Evaluators",
  );
  expect(screen.getByTestId("evaluator-library")).toHaveAttribute(
    "data-kinds",
    "conversation",
  );
  expect(screen.getByTestId("active-item")).toHaveTextContent(
    "simulation-evaluators",
  );
});
