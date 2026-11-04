import { render, screen, setupUser } from "@/test-utils";
import { NothingCanScoreMessage } from "../NothingCanScoreMessage";

it("says variables are the reason and offers the way to fix it", async () => {
  const user = setupUser();
  const onGoToEvaluators = jest.fn();
  const { container } = render(
    <NothingCanScoreMessage
      ineligible={[{ reason: "declares_variables" }]}
      onGoToEvaluators={onGoToEvaluators}
    />,
  );

  expect(
    screen.getByText(/Every evaluator added to this agent has a variable with no trace value chosen/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
  // The copy names the tab itself, so it must not be said twice.
  expect(container).toHaveTextContent(
    /^Every evaluator .* Choose them in the Evaluators tab\.$/,
  );
});

it("says an agent with no evaluators has none to score with", () => {
  const { container } = render(
    <NothingCanScoreMessage ineligible={[]} onGoToEvaluators={jest.fn()} />,
  );
  expect(container).toHaveTextContent(
    "This agent has no evaluators, so its traces are not scored. Choose evaluators that can score traces in the Evaluators tab.",
  );
});
