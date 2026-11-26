import { render, screen } from "@/test-utils";
import { EvaluatorCard } from "../EvaluatorCard";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const evaluator = (over: Partial<EvaluatorData>): EvaluatorData => ({
  uuid: "ev",
  name: "Evaluator",
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  output_type: "binary",
  ...over,
});

it.each([
  ["llm", "Conversation reply"],
  ["llm-general", "Agent Response"],
  ["tool-call", "Tool call"],
] as const)("shows the %s type as %s", (type, label) => {
  render(<EvaluatorCard evaluator={evaluator({ evaluator_type: type })} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});

it("lets the mouse reach the type pill, so its tooltip can show", () => {
  render(
    <EvaluatorCard evaluator={evaluator({ evaluator_type: "tool-call" })} />,
  );
  expect(
    screen.getByText("Tool call").closest(".pointer-events-auto"),
  ).not.toBeNull();
});
