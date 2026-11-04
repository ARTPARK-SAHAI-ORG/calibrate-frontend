import { render, screen } from "@/test-utils";
import { CONTACT_LINK } from "@/constants/limits";
import { TraceScorePanel } from "../TraceScorePanel";
import type { TraceScoringRun } from "@/lib/tracesApi";

let mockUsesOwnKeys = false;
jest.mock("../../../hooks/useMaxRowsPerEval", () => ({
  ...jest.requireActual("../../../hooks/useMaxRowsPerEval"),
  useUsesOwnProviderKeys: () => mockUsesOwnKeys,
}));

beforeEach(() => {
  mockUsesOwnKeys = false;
});

jest.mock("../../EvaluatorVerdictCard", () => ({
  evaluatorCardSurfaceClass: () => "evaluator-card",
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

describe("variables a trace had no value for", () => {
  const missing = (
    evaluator_uuid: string,
    name: string,
    variable: string,
    source: string,
  ) => ({ evaluator_uuid, name, variable, source });
  const skipped: TraceScoringRun = {
    run_uuid: "r6",
    status: "skipped",
    created_at: "2026-08-29T12:00:00Z",
    error: "missing_trace_values",
    results: [],
    missing_values: [
      missing("ev-9", "Agrees with the nurse", "nurse_reply", "metadata.expert_answer"),
    ],
  };
  const GENERIC = "This trace is missing a value that its evaluators need";

  it("names the metadata entry, and shows no general line on a skipped run", () => {
    const { container } = render(<TraceScorePanel run={skipped} />);

    const block = container.querySelector(".evaluator-card");
    expect(block).toHaveTextContent(
      "Agrees with the nurseCould not run. {{nurse_reply}} reads from the metadata entry expert_answer, and this trace does not have it.",
    );
    expect(block?.querySelector(".border-amber-500\\/40")).not.toBeNull();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it.each([
    ["input", "the input"],
    ["output.response", "the agent reply"],
    ["output.tool_calls", "the tool calls"],
    ["labels", "the labels"],
    ["conversation_id", "the conversation ID"],
    ["message_id", "the message ID"],
  ])("names %s in words", (source, words) => {
    render(
      <TraceScorePanel
        run={{ ...skipped, missing_values: [missing("e", "E", "x", source)] }}
      />,
    );
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === "P" &&
          el.textContent ===
            `Could not run. {{x}} reads from ${words}, and this trace does not have it.`,
      ),
    ).toBeInTheDocument();
  });

  it("puts several variables of one evaluator in one block, one sentence each", () => {
    const { container } = render(
      <TraceScorePanel
        run={{
          ...skipped,
          missing_values: [
            missing("e1", "First", "a", "labels"),
            missing("e2", "Second", "c", "input"),
            missing("e1", "First", "b", "message_id"),
          ],
        }}
      />,
    );

    const blocks = container.querySelectorAll(".evaluator-card");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("{{a}} reads from the labels");
    expect(blocks[0]).toHaveTextContent("{{b}} reads from the message ID");
    expect(blocks[0].querySelectorAll(".border-amber-500\\/40 p")).toHaveLength(2);
    expect(blocks[1]).toHaveTextContent("{{c}} reads from the input");
  });

  it("shows a block beside the scores of a completed run", () => {
    const { container } = render(
      <TraceScorePanel
        run={{
          ...completed,
          missing_values: [missing("e3", "Third", "x", "labels")],
        }}
      />,
    );

    expect(screen.getByTestId("verdict-Tone")).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toHaveTextContent(
      "Third",
    );
  });

  it("shows only the block when a completed run has no scores", () => {
    const { container } = render(
      <TraceScorePanel
        run={{
          ...completed,
          results: [],
          missing_values: [missing("e3", "Third", "x", "labels")],
        }}
      />,
    );

    expect(container.querySelector(".evaluator-card")).not.toBeNull();
    expect(
      screen.queryByText("This run produced no scores."),
    ).not.toBeInTheDocument();
  });

  it("keeps the general line when the skipped run names nothing", () => {
    const { container, rerender } = render(
      <TraceScorePanel run={{ ...skipped, missing_values: [] }} />,
    );
    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toBeNull();

    // A run from before the backend reported these.
    rerender(<TraceScorePanel run={{ ...skipped, missing_values: undefined }} />);
    expect(screen.getByText(GENERIC)).toBeInTheDocument();
  });

  it("leaves other run states as they are", () => {
    const values = skipped.missing_values;
    const { container, rerender } = render(
      <TraceScorePanel
        run={{ ...skipped, error: "over_limit", missing_values: values }}
      />,
    );
    expect(container.querySelector(".evaluator-card")).toBeNull();

    rerender(
      <TraceScorePanel run={{ ...skipped, status: "failed", missing_values: values }} />,
    );
    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toBeNull();

    rerender(<TraceScorePanel run={{ ...skipped, status: "pending" }} />);
    expect(
      screen.getByText("Running the evaluators on this trace"),
    ).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toBeNull();
  });
});
