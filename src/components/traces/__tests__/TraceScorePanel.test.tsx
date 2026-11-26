import { render, screen, setupUser } from "@/test-utils";
import { CONTACT_LINK } from "@/constants/limits";
import { TraceScorePanel } from "../TraceScorePanel";
import type { TraceScoringRun } from "@/lib/tracesApi";

let mockUsesOwnKeys = false;
jest.mock("../../../hooks/useOrgLimits", () => ({
  ...jest.requireActual("../../../hooks/useOrgLimits"),
  useUsesOwnProviderKeys: () => mockUsesOwnKeys,
}));

beforeEach(() => {
  mockUsesOwnKeys = false;
});

jest.mock("../../EvaluatorVerdictCard", () => ({
  EvaluatorVerdictCard: ({
    name,
    description,
    outputType,
    match,
    score,
    reasoning,
    scaleMax,
    versionLabel,
    enableLink,
  }: {
    name: string;
    description?: string | null;
    outputType: string;
    match?: boolean | null;
    score?: number | null;
    reasoning?: string | null;
    scaleMax?: number;
    versionLabel?: string | null;
    enableLink?: boolean;
  }) => (
    <div data-testid={`verdict-${name}`}>
      {name} {outputType} match:{String(match)} score:{String(score)} max:
      {String(scaleMax)} {reasoning} version:{String(versionLabel)} link:
      {String(enableLink)} about:{String(description)}
    </div>
  ),
}));

const completed: TraceScoringRun = {
  run_uuid: "run-new",
  status: "completed",
  created_at: "2026-08-29T12:00:00Z",
  completed_at: "2026-08-29T12:01:00Z",
  error: null,
  results: [
    {
      evaluator_uuid: "ev-1",
      name: "Tone",
      output_type: "binary",
      value: 1,
      reasoning: "Greeting was present.",
      passed: true,
    },
    {
      evaluator_uuid: "ev-2",
      name: "Helpfulness",
      output_type: "rating",
      scale_min: 1,
      scale_max: 5,
      value: 4,
      reasoning: "Almost complete.",
      passed: false,
    },
  ],
};

const prior: TraceScoringRun = {
  run_uuid: "run-old",
  status: "failed",
  created_at: "2026-08-28T12:00:00Z",
  completed_at: "2026-08-28T12:02:00Z",
  error: "over_limit",
  results: [],
};

it("draws one card per evaluator of the run it is given, with no id pill", () => {
  render(<TraceScorePanel run={completed} />);

  expect(screen.getByRole("heading", { name: "Scores" })).toBeInTheDocument();
  // A binary result reaches the verdict card as its passed flag; a rating
  // value reaches it as the score. Neither field carries the other type.
  expect(screen.getByTestId("verdict-Tone")).toHaveTextContent(
    "binary match:true score:undefined",
  );
  expect(screen.getByTestId("verdict-Helpfulness")).toHaveTextContent(
    "rating match:undefined score:4",
  );
  expect(screen.getByTestId("verdict-Helpfulness")).toHaveTextContent("max:5");
  expect(screen.getByTestId("verdict-Tone")).toHaveTextContent(
    "version:undefined link:true",
  );
  // No run headings, no status pill, no version id beside the name.
  expect(
    screen.queryByText(/Latest scores|Earlier scores/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Completed|Scored/)).not.toBeInTheDocument();
});

it("shows a spinner while scoring, the reason when it failed, and empty results", () => {
  const { rerender, container } = render(
    <TraceScorePanel
      run={{
        run_uuid: "r1",
        status: "pending",
        created_at: "2026-08-29T12:00:00Z",
        results: [],
      }}
    />,
  );
  expect(
    screen.getByText("Running the evaluators on this trace"),
  ).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).toBeInTheDocument();

  rerender(
    <TraceScorePanel
      run={{
        run_uuid: "r2",
        status: "processing",
        created_at: "2026-08-29T12:00:00Z",
        results: [],
      }}
    />,
  );
  expect(
    screen.getByText("Running the evaluators on this trace"),
  ).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).toBeInTheDocument();

  rerender(
    <TraceScorePanel
      run={{
        run_uuid: "r3",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "no_usable_evaluators",
        results: [],
      }}
    />,
  );
  expect(
    screen.getByText("No evaluator on this agent could score this trace"),
  ).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();

  rerender(
    <TraceScorePanel
      run={{
        run_uuid: "r4",
        status: "completed",
        created_at: "2026-08-29T12:00:00Z",
        completed_at: "2026-08-29T12:01:00Z",
        results: [],
      }}
    />,
  );
  expect(screen.getByText("This run produced no scores.")).toBeInTheDocument();
});

it("shows every reason a trace was not scored as a warning, not a note", () => {
  const { container } = render(
    <TraceScorePanel
      run={{
        run_uuid: "r5",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "scoring_disabled",
        results: [],
      }}
    />,
  );

  const box = container.querySelector(".border-amber-500\\/40");
  expect(box).not.toBeNull();
  expect(box).toHaveTextContent(
    "Monitoring was turned off before this trace was scored",
  );
  expect(box?.querySelector("p")?.className).toContain("text-amber-700");
  // Only the limit has somewhere for the reader to go next.
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("says the workspace is over its scoring limit and offers the contact link", () => {
  const { container } = render(<TraceScorePanel run={prior} />);

  const box = container.querySelector(".border-amber-500\\/40");
  expect(box).not.toBeNull();
  expect(box).toHaveTextContent(
    "This workspace has reached its limit for scoring traces. Click here to contact us to extend your limits.",
  );

  const link = screen.getByRole("link", { name: "Click here" });
  expect(link).toHaveAttribute("href", CONTACT_LINK);
  expect(link).toHaveAttribute("target", "_blank");
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
  // Bold, with no underline, the same as the limit message shown elsewhere.
  expect(link.className).toContain("font-bold");
  expect(link.className).not.toContain("underline");
});

it("does not offer the contact link once the workspace uses its own provider keys", () => {
  mockUsesOwnKeys = true;
  const { container } = render(<TraceScorePanel run={prior} />);

  expect(container.querySelector(".border-amber-500\\/40")).toHaveTextContent(
    /^This trace was not scored because the workspace had reached its scoring limit at the time$/,
  );
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});

it("gives each card what its own evaluator is for, and nothing for one with no words", () => {
  render(
    <TraceScorePanel
      run={completed}
      descriptions={{ "ev-1": "Was the caller greeted politely?" }}
    />,
  );

  expect(screen.getByTestId("verdict-Tone")).toHaveTextContent(
    "about:Was the caller greeted politely?",
  );
  expect(screen.getByTestId("verdict-Helpfulness")).toHaveTextContent(
    "about:undefined",
  );
});

it("shows the error when the scores could not be loaded", () => {
  render(<TraceScorePanel run={null} error="Could not load scores." />);
  expect(screen.getByText("Could not load scores.")).toBeInTheDocument();
});

it("names each evaluator that could not score the trace, and why", () => {
  render(
    <TraceScorePanel
      run={{
        ...completed,
        status: "skipped",
        error: "no_usable_evaluators",
        results: [],
      }}
      ineligible={[
        {
          evaluator_uuid: "e1",
          name: "Tone check",
          reason: "declares_variables",
        },
      ]}
    />,
  );
  expect(
    screen.getByText("No evaluator on this agent could score this trace"),
  ).toBeInTheDocument();
  expect(screen.getByText("Tone check")).toBeInTheDocument();
  expect(
    screen.getByText(/uses variables, which cannot be filled/),
  ).toBeInTheDocument();
});

it("points at the Evaluators tab when no evaluator fits and none is listed", async () => {
  const onGoToEvaluators = jest.fn();
  const user = setupUser();
  render(
    <TraceScorePanel
      run={{
        run_uuid: "r11",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "no_usable_evaluators",
        results: [],
      }}
      ineligible={[]}
      onGoToEvaluators={onGoToEvaluators}
    />,
  );
  expect(document.body).toHaveTextContent(
    "No evaluator on this agent could score this trace. Add one that can in the Evaluators tab.",
  );
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

it("points at the Evaluators tab beside the evaluators that do not fit", async () => {
  const onGoToEvaluators = jest.fn();
  const user = setupUser();
  render(
    <TraceScorePanel
      run={{
        run_uuid: "r12",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "no_usable_evaluators",
        results: [],
      }}
      ineligible={[
        {
          evaluator_uuid: "e1",
          name: "Tone check",
          reason: "declares_variables",
        },
      ]}
      onGoToEvaluators={onGoToEvaluators}
    />,
  );
  expect(screen.getByText("Tone check")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

it("says the agent has no tool call evaluator and offers the button to add one", () => {
  render(
    <TraceScorePanel
      run={{
        run_uuid: "r9",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "no_tool_call_evaluator",
        results: [],
      }}
      addToolCallEvaluator={
        <button type="button">Add a tool call evaluator</button>
      }
    />,
  );
  const sentence = screen.getByText(
    "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent.",
  );
  const button = screen.getByRole("button", {
    name: "Add a tool call evaluator",
  });
  // The button sits on its own line under the sentence, not inside it.
  expect(sentence).not.toContainElement(button);
});

it("says the trace was skipped before a tool call evaluator was added, with no button, once the agent has one", () => {
  render(
    <TraceScorePanel
      run={{
        run_uuid: "r10",
        status: "skipped",
        created_at: "2026-08-29T12:00:00Z",
        error: "no_tool_call_evaluator",
        results: [],
      }}
    />,
  );
  expect(document.body).toHaveTextContent(
    /^Scores\s*This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent$/,
  );
  expect(
    screen.queryByRole("button", { name: "Add a tool call evaluator" }),
  ).not.toBeInTheDocument();
});

it("offers the button only beside the missing tool call evaluator reason", () => {
  render(
    <TraceScorePanel
      run={{
        run_uuid: "r11",
        status: "failed",
        created_at: "2026-08-29T12:00:00Z",
        error: "cli_failed",
        results: [],
      }}
      addToolCallEvaluator={
        <button type="button">Add a tool call evaluator</button>
      }
    />,
  );
  expect(
    screen.queryByRole("button", { name: "Add a tool call evaluator" }),
  ).not.toBeInTheDocument();
});
