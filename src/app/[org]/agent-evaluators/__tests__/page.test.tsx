import React from "react";
import { render, screen } from "@/test-utils";
import AgentEvaluatorsPage from "../page";

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

it("shows only the evaluators that can be added to an agent", () => {
  render(<AgentEvaluatorsPage />);

  expect(screen.getByTestId("evaluator-library")).toHaveAttribute(
    "data-title",
    "Evaluators",
  );
  expect(screen.getByTestId("evaluator-library")).toHaveAttribute(
    "data-kinds",
    "llm,llm-general,tool-call",
  );
  expect(screen.getByTestId("active-item")).toHaveTextContent(
    "agent-evaluators",
  );
});
