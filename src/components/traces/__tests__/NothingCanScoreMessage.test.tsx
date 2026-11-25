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

  expect(document.body).toHaveTextContent(
    "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically. Add an evaluator without variables in the Evaluators tab.",
  );
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

it("says an agent with no evaluators has none to score with", () => {
  render(
    <NothingCanScoreMessage ineligible={[]} onGoToEvaluators={jest.fn()} />,
  );
  expect(screen.getByText(/This agent has no evaluators/)).toBeInTheDocument();
});

it("names a missing prompt instead of variables", () => {
  render(
    <NothingCanScoreMessage
      ineligible={[{ reason: "no_judge_prompt" }]}
      onGoToEvaluators={jest.fn()}
    />,
  );
  expect(document.body).toHaveTextContent(
    "None of the evaluators added to this agent have a prompt, so only people can answer them. Add an evaluator with a prompt in the Evaluators tab.",
  );
  expect(document.body).not.toHaveTextContent(/variables/);
});
