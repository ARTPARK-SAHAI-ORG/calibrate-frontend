import { render, screen, setupUser, waitFor } from "@/test-utils";
import { EvaluatorPillList } from "../EvaluatorPillList";

describe("EvaluatorPillList", () => {
  it("shows a dash when there are no evaluators", () => {
    render(<EvaluatorPillList evaluators={[]} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows every evaluator as its own pill when there are 2 or fewer", () => {
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Conciseness" },
          { uuid: "2", name: "Correctness" },
        ]}
      />,
    );
    expect(screen.getByText("Conciseness")).toBeInTheDocument();
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it("folds evaluators past the first into a +N chip", () => {
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "Reply Conciseness" },
          { uuid: "3", name: "Hindi Language adherence" },
          { uuid: "4", name: "Correctness" },
        ]}
      />,
    );
    expect(screen.getByText("Script Fidelity test")).toBeInTheDocument();
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument();
  });

  it("shows the folded evaluators as pills in a tooltip on hover", async () => {
    const user = setupUser();
    render(
      <EvaluatorPillList
        evaluators={[
          { uuid: "1", name: "Script Fidelity test" },
          { uuid: "2", name: "Reply Conciseness" },
          { uuid: "3", name: "Hindi Language adherence" },
        ]}
      />,
    );

    expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument();

    await user.hover(screen.getByText("+2"));
    expect(await screen.findByText("Reply Conciseness")).toBeInTheDocument();
    expect(screen.getByText("Hindi Language adherence")).toBeInTheDocument();

    await user.unhover(screen.getByText("+2"));
    await waitFor(() =>
      expect(screen.queryByText("Reply Conciseness")).not.toBeInTheDocument(),
    );
  });
});
