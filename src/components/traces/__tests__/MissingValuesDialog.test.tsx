import { render, screen, setupUser } from "@/test-utils";
import {
  MissingValuesDialog,
  type MissingValues,
} from "../MissingValuesDialog";

const evaluators = [
  {
    uuid: "e1",
    name: "Feedback check",
    variables: [{ name: "comment", source: "feedback.comment" }],
  },
];

const traces = [
  { traceId: "t1", label: "Has it", values: { e1: { comment: "Fine" } } },
  { traceId: "t2", label: "Lacks it", values: { e1: { comment: null } } },
  { traceId: "t3", label: "Also has it", values: { e1: { comment: "Ok" } } },
];

const setup = ({
  evaluators: shownEvaluators = evaluators,
  traces: shownTraces = traces,
  ...props
}: Partial<
  React.ComponentProps<typeof MissingValuesDialog> & MissingValues
> = {}) => {
  const onBack = jest.fn();
  const onConfirm = jest.fn();
  render(
    <MissingValuesDialog
      missing={{ evaluators: shownEvaluators, traces: shownTraces }}
      totalTraces={3}
      outcome="tests"
      onBack={onBack}
      onConfirm={onConfirm}
      {...props}
    />,
  );
  return { onBack, onConfirm };
};

describe("MissingValuesDialog", () => {
  it("says no test can be added when the only evaluator has no value", () => {
    setup({ traces: [traces[1]], totalTraces: 1 });
    expect(screen.getByText(/No test can be added/)).toHaveTextContent(
      "No test can be added. This trace has no value for the evaluator you picked. Go back and pick another evaluator.",
    );
    expect(
      screen.getByRole("button", { name: "Add without them" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeEnabled();
  });

  it("says none of several traces can be added", () => {
    setup({
      traces: [
        traces[1],
        { ...traces[1], traceId: "t4", label: "Lacks it too" },
      ],
      totalTraces: 2,
    });
    expect(screen.getByText(/No test can be added/)).toHaveTextContent(
      "No test can be added. None of these traces has a value for any evaluator you picked. Go back and pick another evaluator.",
    );
    expect(
      screen.getByRole("button", { name: "Add without them" }),
    ).toBeDisabled();
  });

  it("says no test can be added when one trace has no value for any of several evaluators", () => {
    setup({
      evaluators: [
        evaluators[0],
        {
          uuid: "e2",
          name: "City check",
          variables: [{ name: "city", source: "metadata.city" }],
        },
      ],
      traces: [
        { traceId: "t2", label: "Lacks it", values: { e1: { comment: null } } },
      ],
      totalTraces: 1,
    });
    expect(screen.getByText(/No test can be added/)).toHaveTextContent(
      "No test can be added. This trace has no value for any evaluator you picked. Go back and pick another evaluator.",
    );
  });

  it("still adds when another ticked evaluator needs no values", () => {
    setup({ traces: [traces[1]], totalTraces: 1, hasOtherEvaluators: true });
    expect(screen.queryByText(/No test can be added/)).toBeNull();
    // One trace: the heading says it is missing a value, so the text does not.
    expect(
      screen.getByText(
        "This test is added without the evaluator it has no value for.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add without them" }),
    ).toBeEnabled();
  });

  it("never blocks labelling, where the value is left blank", () => {
    setup({ traces: [traces[1]], totalTraces: 1, outcome: "labelling" });
    expect(screen.queryByText(/No test can be added/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "Add with them blank" }),
    ).toBeEnabled();
  });

  it("says how many traces are missing a value and how many have every one", () => {
    setup();
    // One of three is missing, so it is not "some traces".
    expect(screen.getByText("A trace is missing a value")).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(
      screen.getByText(/This test is added without the evaluator/),
    ).toHaveTextContent(
      "1 of 3 traces is missing a value. This test is added without the evaluator it has no value for. If that leaves it with no evaluator, it is not added. The other 2 traces have every value.",
    );
  });

  it("does not say a trace may be left out when another evaluator needs no values", () => {
    setup({ hasOtherEvaluators: true });
    expect(
      screen.getByText(/This test is added without the evaluator/),
    ).toHaveTextContent(
      "1 of 3 traces is missing a value. This test is added without the evaluator it has no value for. The other 2 traces have every value.",
    );
  });

  it("says some traces are missing a value when more than one is", () => {
    setup({
      traces: [
        traces[1],
        { ...traces[1], traceId: "t4", label: "Lacks it too" },
      ],
    });
    expect(
      screen.getByText("Some traces are missing a value"),
    ).toBeInTheDocument();
  });

  it("says only what happens to the item when there is one trace", () => {
    setup({ traces: [traces[1]], totalTraces: 1, outcome: "labelling" });
    expect(
      screen.getByText("This item is added with that value left blank."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1 of 1/)).toBeNull();
    // One trace is not "some traces".
    expect(
      screen.getByText("This trace is missing a value"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Some traces are missing a value"),
    ).not.toBeInTheDocument();
  });

  it.each([
    [
      "tests",
      "Each of these tests is added without the evaluator it has no value for. A trace left with no evaluator is not added.",
    ],
    ["labelling", "These items are added with that value left blank."],
  ] as const)(
    "speaks of several traces missing a value for %s",
    (outcome, sentence) => {
      setup({
        traces: [
          traces[1],
          { ...traces[1], traceId: "t4", label: "Lacks it too" },
          traces[0],
        ],
        totalTraces: 3,
        outcome,
      });
      expect(screen.getByText(sentence, { exact: false })).toHaveTextContent(
        `2 of 3 traces are missing a value. ${sentence} The other trace has every value.`,
      );
    },
  );

  it("lists only the traces missing a value, under each evaluator's variable", () => {
    setup();
    expect(screen.getByText("Lacks it")).toBeInTheDocument();
    expect(screen.queryByText("Has it")).not.toBeInTheDocument();
    expect(screen.queryByText("Also has it")).not.toBeInTheDocument();
    expect(screen.getByText("Value missing")).toBeInTheDocument();
    expect(screen.getByText("Feedback check")).toBeInTheDocument();
    expect(screen.getByText("{{comment}}")).toBeInTheDocument();
    expect(screen.getByText("User feedback comment")).toBeInTheDocument();
  });

  it("shows the value a trace does have beside one it lacks", () => {
    setup({
      evaluators: [
        {
          ...evaluators[0],
          variables: [
            { name: "comment", source: "feedback.comment" },
            { name: "city", source: "metadata.city" },
          ],
        },
      ],
      traces: [
        {
          traceId: "t1",
          label: "Mixed",
          values: { e1: { comment: null, city: "Pune" } },
        },
      ],
      totalTraces: 1,
    });
    expect(screen.getByText("Pune")).toBeInTheDocument();
    expect(screen.getByText("Value missing")).toBeInTheDocument();
  });

  it("goes back or adds the tests without them", async () => {
    const user = setupUser();
    const { onBack, onConfirm } = setup();
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(onBack).toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Add without them" }));
    expect(onConfirm).toHaveBeenCalled();
  });

  it("names the labelling choice and holds both buttons while busy", () => {
    setup({ outcome: "labelling", busy: true });
    expect(
      screen.getByRole("button", { name: "Add with them blank" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  });
});
