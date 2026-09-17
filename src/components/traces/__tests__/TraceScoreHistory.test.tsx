import { render, screen } from "@/test-utils";
import { TraceScoreHistory } from "../TraceScoreHistory";
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
      evaluator_type: "llm",
      output_type: "binary",
      value: 1,
      reasoning: "Greeting was present.",
      evaluator_version_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      passed: true,
    },
    {
      evaluator_uuid: "ev-2",
      name: "Helpfulness",
      evaluator_type: "llm",
      output_type: "rating",
      scale_min: 1,
      scale_max: 5,
      value: 4,
      reasoning: "Almost complete.",
      evaluator_version_id: "11111111-2222-3333-4444-555555555555",
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

it("draws one card per evaluator of the latest run only, with no id pill", () => {
  render(<TraceScoreHistory runs={[completed, prior]} />);

  expect(screen.getByRole("heading", { name: "Scores" })).toBeInTheDocument();
  // A binary value 1 reaches the verdict card as a true match; a rating
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
  expect(screen.queryByText(/aaaaaaaa/)).not.toBeInTheDocument();
  // The earlier, failed run is not drawn.
  expect(
    screen.queryByText(/Latest scores|Earlier scores/),
  ).not.toBeInTheDocument();
  expect(screen.queryByText(/Completed|Scored/)).not.toBeInTheDocument();
  expect(
    screen.queryByText("This scoring run could not be completed"),
  ).not.toBeInTheDocument();
});

it("shows a spinner while scoring, the reason when it failed, and empty results", () => {
  const { rerender, container } = render(
    <TraceScoreHistory
      runs={[
        {
          run_uuid: "r1",
          status: "pending",
          created_at: "2026-08-29T12:00:00Z",
          results: [],
        },
      ]}
    />,
  );
  expect(screen.getByText("Scoring this trace.")).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).toBeInTheDocument();

  rerender(
    <TraceScoreHistory
      runs={[
        {
          run_uuid: "r2",
          status: "processing",
          created_at: "2026-08-29T12:00:00Z",
          results: [],
        },
      ]}
    />,
  );
  expect(screen.getByText("Scoring this trace.")).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).toBeInTheDocument();

  rerender(
    <TraceScoreHistory
      runs={[
        {
          run_uuid: "r3",
          status: "skipped",
          created_at: "2026-08-29T12:00:00Z",
          error: "no_usable_evaluators",
          results: [],
        },
      ]}
    />,
  );
  expect(
    screen.getByText("No evaluators could score this trace"),
  ).toBeInTheDocument();
  expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();

  rerender(<TraceScoreHistory runs={[prior]} />);
  expect(
    screen.getByText("This scoring run could not be completed"),
  ).toBeInTheDocument();

  rerender(
    <TraceScoreHistory
      runs={[
        {
          run_uuid: "r4",
          status: "completed",
          created_at: "2026-08-29T12:00:00Z",
          completed_at: "2026-08-29T12:01:00Z",
          results: [],
        },
      ]}
    />,
  );
  expect(
    screen.getByText("No evaluator results were stored for this run."),
  ).toBeInTheDocument();
});

it("shows loading, error, and empty copy", () => {
  const { rerender } = render(<TraceScoreHistory runs={[]} isLoading />);
  expect(screen.getByText("Loading scores…")).toBeInTheDocument();

  rerender(<TraceScoreHistory runs={[]} error="Could not load scores." />);
  expect(screen.getByText("Could not load scores.")).toBeInTheDocument();

  rerender(<TraceScoreHistory runs={[]} />);
  expect(
    screen.getByText("This trace has not been scored."),
  ).toBeInTheDocument();
});
