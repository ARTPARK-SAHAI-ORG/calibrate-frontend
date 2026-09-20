import { render, screen, setupUser } from "@/test-utils";
import { NothingCanScoreMessage } from "../NothingCanScoreMessage";

it("says variables are the reason and offers the way to fix it", async () => {
  const user = setupUser();
  const onGoToEvaluators = jest.fn();
  render(
    <NothingCanScoreMessage
      ineligible={[{ reason: "declares_variables" }]}
      onGoToEvaluators={onGoToEvaluators}
    />,
  );

  expect(
    screen.getByText(/Every evaluator added to this agent uses variables/),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

it("says an agent with no evaluators has none to score with", () => {
  render(
    <NothingCanScoreMessage ineligible={[]} onGoToEvaluators={jest.fn()} />,
  );
  expect(screen.getByText(/This agent has no evaluators/)).toBeInTheDocument();
});
