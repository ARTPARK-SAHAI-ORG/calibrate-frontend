import { render, screen, setupUser } from "@/test-utils";
import { TraceScoringChip } from "../TraceScoringChip";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";

// The names are the only thing this chip hands the shared pill list, so the
// list is stood in for and the names it was given are read back off it.
jest.mock("../../EvaluatorPillList", () => ({
  __esModule: true,
  EvaluatorPillList: ({
    evaluators,
    layout,
  }: {
    evaluators: { uuid?: string | null; name: string }[];
    layout?: string;
  }) => (
    <div data-testid="pill-list" data-layout={layout}>
      {evaluators.map((item) => item.name).join(", ")}
    </div>
  ),
}));

function controls(
  overrides: Partial<TraceScoringControls> = {},
): TraceScoringControls {
  return {
    enabled: false,
    saving: false,
    setEnabled: jest.fn().mockResolvedValue(undefined),
    eligibility: {
      eligible: [{ evaluator_uuid: "ev-1", name: "Tone" }],
      ineligible: [
        {
          evaluator_uuid: "ev-2",
          name: "Coverage",
          reason: "declares_variables",
        },
      ],
    },
    eligibilityError: null,
    saveError: null,
    enableBlocked: false,
    cannotEnable: false,
    ...overrides,
  };
}

const pill = () =>
  screen.getByRole("button", { name: /Continuous monitoring/ });

it("reads off and is amber when scoring is not on", () => {
  render(<TraceScoringChip traceScoring={controls()} />);
  const button = screen.getByRole("button", {
    name: "Continuous monitoring off",
  });
  expect(button.className).toContain("bg-amber-500/10");
  expect(button.className).not.toContain("bg-green-500/10");
  expect(button).toBeEnabled();
});

it("reads on and is green when scoring is on", () => {
  render(<TraceScoringChip traceScoring={controls({ enabled: true })} />);
  const button = screen.getByRole("button", {
    name: "Continuous monitoring on",
  });
  expect(button.className).toContain("bg-green-500/10");
  expect(button.className).not.toContain("bg-amber-500/10");
});

it("asks before turning scoring on, and turns it on when confirmed", async () => {
  const user = setupUser();
  const setEnabled = jest.fn().mockResolvedValue(undefined);
  render(<TraceScoringChip traceScoring={controls({ setEnabled })} />);

  await user.click(pill());
  expect(
    screen.getByRole("heading", { name: "Turn on continuous monitoring" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "All new traces will be scored using your evaluators. Existing traces won't be scored.",
    ),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Turn on" }));
  expect(setEnabled).toHaveBeenCalledWith(true);
  expect(
    screen.queryByRole("heading", { name: "Turn on continuous monitoring" }),
  ).not.toBeInTheDocument();
});

it("asks before turning scoring off, with its own words", async () => {
  const user = setupUser();
  const setEnabled = jest.fn().mockResolvedValue(undefined);
  render(
    <TraceScoringChip traceScoring={controls({ enabled: true, setEnabled })} />,
  );

  await user.click(pill());
  expect(
    screen.getByRole("heading", { name: "Turn off continuous monitoring" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "New traces will not be scored. Traces with existing scores won't be affected.",
    ),
  ).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Turn off" }));
  expect(setEnabled).toHaveBeenCalledWith(false);
});

it("changes nothing when the question is cancelled", async () => {
  const user = setupUser();
  const setEnabled = jest.fn().mockResolvedValue(undefined);
  render(<TraceScoringChip traceScoring={controls({ setEnabled })} />);

  await user.click(pill());
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(setEnabled).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("heading", { name: "Turn on continuous monitoring" }),
  ).not.toBeInTheDocument();
});

it("cannot be pressed when no evaluator can score, or while saving", () => {
  const { rerender } = render(
    <TraceScoringChip
      traceScoring={controls({ enableBlocked: true, cannotEnable: true })}
    />,
  );
  expect(pill()).toBeDisabled();

  // Being blocked only matters while scoring is off: turning it off is
  // always allowed.
  rerender(
    <TraceScoringChip
      traceScoring={controls({ enabled: true, enableBlocked: true })}
    />,
  );
  expect(pill()).toBeEnabled();

  rerender(<TraceScoringChip traceScoring={controls({ saving: true })} />);
  expect(pill()).toBeDisabled();
});

it("shows both evaluator groups and the note for turning it on, on hover", async () => {
  const user = setupUser();
  render(<TraceScoringChip traceScoring={controls()} />);

  await user.hover(pill());
  expect(
    await screen.findByText(/Click to turn on\. New traces will be scored/),
  ).toBeInTheDocument();
  expect(screen.getByText("Evaluators used for scoring")).toBeInTheDocument();
  expect(
    screen.getByText("Evaluators not used for scoring"),
  ).toBeInTheDocument();
  expect(
    screen.getByText(
      "Uses variables, which cannot be filled for a trace automatically",
    ),
  ).toBeInTheDocument();

  const lists = screen.getAllByTestId("pill-list");
  expect(lists).toHaveLength(2);
  expect(lists[0]).toHaveTextContent("Tone");
  expect(lists[0]).toHaveAttribute("data-layout", "flow");
  expect(lists[1]).toHaveTextContent("Coverage");
  expect(lists[1]).toHaveAttribute("data-layout", "flow");
});

it("says what a click does when scoring is already on, and leaves out an empty group", async () => {
  const user = setupUser();
  render(
    <TraceScoringChip
      traceScoring={controls({
        enabled: true,
        eligibility: {
          eligible: [{ evaluator_uuid: "ev-1", name: "Tone" }],
          ineligible: [],
        },
      })}
    />,
  );

  await user.hover(pill());
  expect(
    await screen.findByText(/Click to turn off\. New traces will no longer/),
  ).toBeInTheDocument();
  expect(
    screen.queryByText("Evaluators not used for scoring"),
  ).not.toBeInTheDocument();
  expect(screen.getAllByTestId("pill-list")).toHaveLength(1);
});

it("shows the reason a save failed", async () => {
  const user = setupUser();
  render(
    <TraceScoringChip
      traceScoring={controls({ saveError: "Could not save this setting." })}
    />,
  );

  await user.hover(pill());
  expect(
    await screen.findByText("Could not save this setting."),
  ).toBeInTheDocument();
});
