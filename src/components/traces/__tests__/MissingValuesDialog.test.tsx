import { render, screen, setupUser } from "@/test-utils";
import { MissingValuesDialog } from "../MissingValuesDialog";

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

const setup = (
  props: Partial<React.ComponentProps<typeof MissingValuesDialog>> = {},
) => {
  const onBack = jest.fn();
  const onConfirm = jest.fn();
  render(
    <MissingValuesDialog
      evaluators={evaluators}
      traces={traces}
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
  it("says how many traces are missing a value and how many have every one", () => {
    setup();
    expect(
      screen.getByText("Some traces are missing a value"),
    ).toBeInTheDocument();
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(
      screen.getByText(/This test is added without the evaluator/),
    ).toHaveTextContent(
      "1 of 3 traces is missing a value. This test is added without the evaluator it has no value for. The other 2 traces have every value.",
    );
  });

  it("drops the last sentence when every trace is missing one", () => {
    setup({ traces: [traces[1]], totalTraces: 1, outcome: "labelling" });
    expect(
      screen.getByText(/This item is added with that value left blank/),
    ).toHaveTextContent(
      "1 of 1 trace is missing a value. This item is added with that value left blank.",
    );
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
      "Each of these tests is added without the evaluator it has no value for.",
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
