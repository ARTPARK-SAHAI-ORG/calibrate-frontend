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
    evaluatorType,
    description,
  }: {
    evaluatorType: string;
    description: string;
  }) => (
    <div data-testid="evaluator-library" data-kind={evaluatorType}>
      {description}
    </div>
  ),
}));

it("shows the conversation evaluators and marks the sidebar entry", () => {
  render(<SimulationEvaluatorsPage />);

  expect(
    screen.getByRole("heading", { name: "Evaluators" }),
  ).toBeInTheDocument();
  expect(screen.getByTestId("evaluator-library")).toHaveAttribute(
    "data-kind",
    "conversation",
  );
  expect(screen.getByTestId("active-item")).toHaveTextContent(
    "simulation-evaluators",
  );
});
