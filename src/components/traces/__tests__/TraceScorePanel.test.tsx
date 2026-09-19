import { render, screen } from "@/test-utils";
import { TraceScorePanel } from "../TraceScorePanel";
import type { TraceScoringRun } from "@/lib/tracesApi";

jest.mock("../../EvaluatorVerdictCard", () => ({
  EvaluatorVerdictCard: ({
    name,
    outputType,
    match,
    score,
    reasoning,
    scaleMax,
    versionLabel,
    enableLink,
  }: {
    name: string;
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
      {String(enableLink)}
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
  error: "corrupt_snapshot",
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
  expect(screen.getByText("Scoring this trace.")).toBeInTheDocument();
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
  expect(screen.getByText("Scoring this trace.")).toBeInTheDocument();
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

  rerender(<TraceScorePanel run={prior} />);
  expect(
    screen.getByText("This scoring run could not be completed"),
  ).toBeInTheDocument();

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
  expect(
    screen.getByText("This run produced no scores."),
  ).toBeInTheDocument();
});

it("shows loading, error, and empty copy", () => {
  const { rerender } = render(<TraceScorePanel run={null} isLoading />);
  expect(screen.getByText("Loading scores…")).toBeInTheDocument();

  rerender(<TraceScorePanel run={null} error="Could not load scores." />);
  expect(screen.getByText("Could not load scores.")).toBeInTheDocument();

  rerender(<TraceScorePanel run={null} />);
  expect(
    screen.getByText("This trace has not been scored."),
  ).toBeInTheDocument();
});
