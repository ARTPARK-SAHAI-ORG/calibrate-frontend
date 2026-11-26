import { render, screen, setupUser } from "@/test-utils";
import {
  EvaluatorTypePill,
  KindPill,
  OutputTypePill,
  EVALUATOR_TYPE_LABELS,
  EVALUATOR_TYPE_TOOLTIPS,
  type EvaluatorType,
} from "../EvaluatorPills";

describe("EvaluatorPills", () => {
  it.each([
    ["EvaluatorTypePill", <EvaluatorTypePill key="t" evaluatorType="llm" />],
    ["KindPill", <KindPill key="k" kind="single" />],
    ["OutputTypePill", <OutputTypePill key="o" outputType="binary" />],
  ])(
    "%s shows its hover text over the pill only, not the whole line",
    (_name, pill) => {
      const { container } = render(<div>{pill}</div>);
      // The hover area wraps the pill; as a full-width block it caught the
      // mouse anywhere on the line beside it.
      expect(container.firstElementChild?.firstElementChild).toHaveClass(
        "inline-block",
      );
    },
  );

  it.each(Object.keys(EVALUATOR_TYPE_LABELS) as EvaluatorType[])(
    "renders EvaluatorTypePill for %s with its label and tooltip",
    async (evaluatorType) => {
      const user = setupUser();
      render(<EvaluatorTypePill evaluatorType={evaluatorType} />);
      expect(
        screen.getByText(EVALUATOR_TYPE_LABELS[evaluatorType]),
      ).toBeInTheDocument();

      await user.hover(screen.getByText(EVALUATOR_TYPE_LABELS[evaluatorType]));
      expect(
        await screen.findByText(EVALUATOR_TYPE_TOOLTIPS[evaluatorType]),
      ).toBeInTheDocument();
    },
  );

  it("renders KindPill for single", async () => {
    const user = setupUser();
    render(<KindPill kind="single" />);
    expect(screen.getByText("Single")).toBeInTheDocument();
    await user.hover(screen.getByText("Single"));
    expect(
      await screen.findByText("Evaluates a single response from the agent."),
    ).toBeInTheDocument();
  });

  it("renders KindPill for side_by_side", async () => {
    const user = setupUser();
    render(<KindPill kind="side_by_side" />);
    expect(screen.getByText("Side by side")).toBeInTheDocument();
    await user.hover(screen.getByText("Side by side"));
    expect(
      await screen.findByText(
        "Compares two outputs side by side and picks a winner.",
      ),
    ).toBeInTheDocument();
  });

  it("renders OutputTypePill for binary with emerald styling", async () => {
    const user = setupUser();
    render(<OutputTypePill outputType="binary" />);
    const pill = screen.getByText("Binary");
    expect(pill.className).toContain("emerald");
    await user.hover(pill);
    expect(
      await screen.findByText(
        "Returns a pass or fail judgement for each evaluation",
      ),
    ).toBeInTheDocument();
  });

  it("renders OutputTypePill for rating with amber styling", async () => {
    const user = setupUser();
    render(<OutputTypePill outputType="rating" />);
    const pill = screen.getByText("Rating");
    expect(pill.className).toContain("amber");
    await user.hover(pill);
    expect(
      await screen.findByText("Returns a numeric score on a rating scale"),
    ).toBeInTheDocument();
  });
});
