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

  // The copy names the tab once, as the link.
  expect(container).toHaveTextContent(
    /^None of the evaluators added to this agent have been configured for traces\. Configure them in the Evaluators tab\.$/,
  );
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

it("says an agent with no evaluators has none to score with", () => {
  const { container } = render(
    <NothingCanScoreMessage ineligible={[]} onGoToEvaluators={jest.fn()} />,
  );
  expect(container).toHaveTextContent(
    "This agent has no evaluators, so its traces are not scored. Add one in the Evaluators tab.",
  );
});
