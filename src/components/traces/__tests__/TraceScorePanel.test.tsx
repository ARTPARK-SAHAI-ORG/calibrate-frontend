import { render, screen } from "@/test-utils";
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
  status: "skipped",
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

it("shows a spinner while scoring, the reason when it was skipped, and empty results", () => {
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
    screen.getByText("No evaluators could score this trace"),
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

it("shows a failed run in the red failure box, with the reason to copy", () => {
  const { container } = render(
    <TraceScorePanel
      run={{
        run_uuid: "r6",
        status: "failed",
        created_at: "2026-08-29T12:00:00Z",
        error: "Error code: 402 - out of credits",
        results: [],
      }}
    />,
  );

  const box = container.querySelector(".border-red-500\\/30");
  expect(box).toHaveTextContent("Something went wrong");
  expect(box).toHaveTextContent("The evaluators could not score this trace.");
  expect(box?.querySelector("pre")).toHaveTextContent(
    "Error code: 402 - out of credits",
  );
  expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  expect(container.querySelector(".border-amber-500\\/40")).toBeNull();
});

it("leaves out the details when the failed run gave no reason", () => {
  const { container } = render(
    <TraceScorePanel
      run={{
        run_uuid: "r7",
        status: "failed",
        created_at: "2026-08-29T12:00:00Z",
        error: null,
        results: [],
      }}
    />,
  );
  expect(
    screen.getByText("The evaluators could not score this trace."),
  ).toBeInTheDocument();
  expect(container.querySelector("pre")).toBeNull();
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
    screen.getByText("No evaluators could score this trace"),
  ).toBeInTheDocument();
  expect(screen.getByText("Tone check")).toBeInTheDocument();
  expect(
    screen.getByText(/uses variables, which cannot be filled/),
  ).toBeInTheDocument();
});

describe("the Score this trace button", () => {
  const skippedFor = (error: string): TraceScoringRun => ({
    run_uuid: "r-score",
    status: "skipped",
    created_at: "2026-08-29T12:00:00Z",
    error,
    results: [],
  });
  const button = <button type="button">Score this trace</button>;

  it("shows under the no-evaluator reason in place of the list of evaluators that cannot score", () => {
    render(
      <TraceScorePanel
        run={skippedFor("no_usable_evaluators")}
        scoreTrace={button}
        scoringEvaluatorNames={["Helpfulness", "Tone", "Safety"]}
        ineligible={[
          { evaluator_uuid: "ev-x", name: "Clarity", reason: "no_live_version" },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Score this trace" }),
    ).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent("Clarity");
    for (const name of ["Helpfulness", "Tone", "Safety"]) {
      expect(screen.getByText(name).tagName).toBe("SPAN");
      expect(screen.getByText(name)).toHaveClass("rounded-md");
    }
    expect(document.body).toHaveTextContent(
      /This trace was not scored because none of the agent's evaluators could score it then\. You have since added Helpfulness, Tone and Safety, which can\.\s*Score this trace$/,
    );
  });

  it("does not show for a trace skipped for another reason", () => {
    render(
      <TraceScorePanel run={skippedFor("over_limit")} scoreTrace={button} />,
    );
    expect(
      screen.queryByRole("button", { name: "Score this trace" }),
    ).not.toBeInTheDocument();
  });
});
