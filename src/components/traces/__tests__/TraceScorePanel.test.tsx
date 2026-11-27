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
    variableValues,
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
    variableValues?: Record<string, string> | null;
  }) => (
    <div data-testid={`verdict-${name}`}>
      {name} {outputType} match:{String(match)} score:{String(score)} max:
      {String(scaleMax)} {reasoning} version:{String(versionLabel)} link:
      {String(enableLink)} about:{String(description)}
      {variableValues &&
        Object.entries(variableValues).map(([k, v]) => (
          <span key={k}>{`var:${k}=${v}`}</span>
        ))}
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

it("passes each evaluator the values it was given for this trace, and nothing when there are none", () => {
  render(
    <TraceScorePanel
      run={{
        ...completed,
        results: [
          { ...completed.results[0], variable_values: { language: "Hindi" } },
          { ...completed.results[1], variable_values: null },
        ],
      }}
    />,
  );
  expect(screen.getByTestId("verdict-Tone")).toHaveTextContent(
    "var:language=Hindi",
  );
  expect(screen.getByTestId("verdict-Helpfulness")).not.toHaveTextContent(
    "var:",
  );
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
    screen.getByText("No evaluator on this agent could score this trace"),
  ).toBeInTheDocument();
  expect(screen.getByText("Tone check")).toBeInTheDocument();
  expect(screen.getByText("Tone check").closest("li")).toHaveTextContent(
    "Tone check: has not been configured for traces. Set it up in the Evaluators tab",
  );
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
          {
            evaluator_uuid: "ev-x",
            name: "Clarity",
            reason: "no_live_version",
          },
        ]}
      />,
    );
    const scoreButton = screen.getByRole("button", { name: "Score this trace" });
    expect(document.querySelector(".border-amber-500\\/40")).not.toContainElement(
      scoreButton,
    );
    expect(document.body).not.toHaveTextContent("Clarity");
    for (const name of ["Helpfulness", "Tone", "Safety"]) {
      expect(screen.getByText(name).tagName).toBe("SPAN");
      expect(screen.getByText(name)).toHaveClass("rounded-md");
    }
    expect(document.body).toHaveTextContent(
      /This trace was not scored because none of the agent's evaluators could score it then\. Helpfulness, Tone and Safety can score it now\.\s*Score this trace$/,
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

it("offers Try again on a failed run only when given a way to retry", async () => {
  const failed: TraceScoringRun = {
    run_uuid: "r-failed",
    status: "failed",
    created_at: "2026-08-29T12:00:00Z",
    error: "Error code: 402",
    results: [],
  };
  const onTryAgain = jest.fn();
  const user = setupUser();
  const { rerender } = render(<TraceScorePanel run={failed} />);
  expect(
    screen.queryByRole("button", { name: "Try again" }),
  ).not.toBeInTheDocument();
  rerender(<TraceScorePanel run={failed} onTryAgain={onTryAgain} />);
  await user.click(screen.getByRole("button", { name: "Try again" }));
  expect(onTryAgain).toHaveBeenCalledTimes(1);
});

it("names an evaluator once when it is shown with a Configure button", () => {
  render(
    <TraceScorePanel
      run={{
        ...completed,
        status: "skipped",
        error: "no_usable_evaluators",
        results: [],
        unconfigured_evaluators: [{ evaluator_uuid: "e1", name: "Tone check" }],
      }}
      ineligible={[
        {
          evaluator_uuid: "e1",
          name: "Tone check",
          reason: "declares_variables",
        },
      ]}
      unconfigured={[{ evaluator_uuid: "e1", name: "Tone check" }]}
      onConfigure={jest.fn()}
    />,
  );
  expect(screen.getAllByText("Tone check")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Configure for traces" })).toBeInTheDocument();
});

describe("a trace skipped because every evaluator needs trace values", () => {
  const MESSAGE =
    "This trace was not scored. None of the evaluators added to this agent have been configured for traces: each one has variables that need to be mapped to a value from the trace. Configure them below, then score this trace again, or add an evaluator without variables in the Evaluators tab.";
  const both = [
    { evaluator_uuid: "e1", name: "Tone check" },
    { evaluator_uuid: "e2", name: "Politeness" },
  ];
  const run: TraceScoringRun = {
    ...completed,
    status: "skipped",
    error: "no_usable_evaluators",
    results: [],
    unconfigured_evaluators: both,
  };
  const ineligible = both.map((e) => ({
    ...e,
    reason: "declares_variables" as const,
  }));

  it("says so in one sentence, with no list, and a card with Configure for each", async () => {
    const onGoToEvaluators = jest.fn();
    const user = setupUser();
    const { container } = render(
      <TraceScorePanel
        run={run}
        ineligible={ineligible}
        unconfigured={both}
        onConfigure={jest.fn()}
        onGoToEvaluators={onGoToEvaluators}
      />,
    );
    const box = container.querySelector(".border-amber-500\\/40");
    expect(box).toHaveTextContent(new RegExp(`^${MESSAGE.replace(/[.()]/g, "\\$&")}$`));
    expect(box?.querySelector("li")).toBeNull();
    expect(
      screen.getAllByText("Did not run as it has not been configured for traces"),
    ).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Configure for traces" })).toHaveLength(2);
    const link = screen.getByRole("button", { name: "Evaluators tab" });
    expect(link.className).toContain("font-semibold");
    expect(link.className).not.toContain("underline");
    await user.click(link);
    expect(onGoToEvaluators).toHaveBeenCalled();
  });

  it("keeps the old message and list when another reason is mixed in", () => {
    const { container } = render(
      <TraceScorePanel
        run={run}
        ineligible={[
          ...ineligible,
          { evaluator_uuid: "e3", name: "Clarity", reason: "no_live_version" },
        ]}
        unconfigured={both}
      />,
    );
    const box = container.querySelector(".border-amber-500\\/40");
    expect(box).toHaveTextContent(
      "No evaluator on this agent could score this trace",
    );
    expect(screen.getByText("Clarity").closest("li")).not.toBeNull();
  });
});

it("leaves out of the list only the evaluators shown as a card", () => {
  render(
    <TraceScorePanel
      run={{
        ...completed,
        status: "skipped",
        error: "no_usable_evaluators",
        results: [],
        unconfigured_evaluators: [{ evaluator_uuid: "e1", name: "Tone check" }],
      }}
      ineligible={[
        {
          evaluator_uuid: "e1",
          name: "Tone check",
          reason: "declares_variables",
        },
        {
          evaluator_uuid: "e2",
          name: "Politeness",
          reason: "declares_variables",
        },
      ]}
      unconfigured={[
        { evaluator_uuid: "e1", name: "Tone check" },
        { evaluator_uuid: "e2", name: "Politeness" },
      ]}
    />,
  );
  expect(screen.getAllByText("Tone check")).toHaveLength(1);
  expect(screen.getByText("Tone check").closest("li")).toBeNull();
  expect(screen.getByText("Politeness").closest("li")).not.toBeNull();
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

  it("names the metadata key, and shows no general line on a skipped run", () => {
    const { container } = render(<TraceScorePanel run={skipped} />);

    const block = container.querySelector('[class*="border-orange-500"]');
    expect(block).toHaveTextContent(
      "Agrees with the nurseCould not run. The variable {{nurse_reply}} is mapped to the metadata key expert_answer, and this trace has no value for it.",
    );
    expect(screen.getByText("{{nurse_reply}}")).toHaveClass(
      "bg-blue-500/10",
      "text-blue-700",
      "font-mono",
    );
    expect(screen.getByText("expert_answer")).toHaveClass(
      "font-mono",
      "bg-amber-700/10",
    );
    expect(block?.querySelector("p.text-orange-700")).not.toBeNull();
    expect(block?.querySelector("svg")).not.toBeNull();
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it.each([
    ["input", "the trace's input"],
    ["output.response", "the trace's agent reply"],
    ["output.tool_calls", "the trace's tool calls"],
    ["labels", "the trace's labels"],
    ["conversation_id", "the trace's conversation ID"],
    ["message_id", "the trace's message ID"],
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
            `Could not run. The variable {{x}} is mapped to ${words}, and this trace has no value for it.`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["conversation", "input", "the trace's conversation"],
    ["conversation", "output.response", "the trace's agent reply"],
    ["general", "input", "the trace's input"],
    ["general", "output.response", "the trace's output"],
  ] as const)(
    "names %s %s the way that agent's dropdown does",
    (agentNature, source, words) => {
      render(
        <TraceScorePanel
          agentNature={agentNature}
          run={{ ...skipped, missing_values: [missing("e", "E", "x", source)] }}
        />,
      );
      expect(
        screen.getByText(
          (_, el) =>
            el?.tagName === "P" &&
            el.textContent ===
              `Could not run. The variable {{x}} is mapped to ${words}, and this trace has no value for it.`,
        ),
      ).toBeInTheDocument();
    },
  );

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

    const blocks = container.querySelectorAll('[class*="border-orange-500"]');
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toHaveTextContent("{{a}} is mapped to the trace's labels");
    expect(blocks[0]).toHaveTextContent(
      "{{b}} is mapped to the trace's message ID",
    );
    expect(blocks[0].querySelectorAll("p.text-orange-700")).toHaveLength(2);
    expect(blocks[1]).toHaveTextContent("{{c}} is mapped to the trace's input");
  });

  it("offers Configure on each block, which opens that evaluator", async () => {
    const user = setupUser();
    const onConfigure = jest.fn();
    const { container } = render(
      <TraceScorePanel
        run={{
          ...skipped,
          missing_values: [
            missing("e1", "First", "a", "labels"),
            missing("e2", "Second", "c", "input"),
          ],
        }}
        onConfigure={onConfigure}
        configuringUuid="e1"
      />,
    );
    const blocks = container.querySelectorAll('[class*="border-orange-500"]');
    expect(blocks[0].querySelector("button")).toBeDisabled();
    await user.click(blocks[1].querySelector("button")!);
    expect(onConfigure).toHaveBeenCalledWith("e2");
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
    expect(container.querySelector('[class*="border-orange-500"]')).toHaveTextContent(
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

    expect(container.querySelector('[class*="border-orange-500"]')).not.toBeNull();
    expect(
      screen.queryByText("This run produced no scores."),
    ).not.toBeInTheDocument();
  });

  it("keeps the general line when the skipped run names nothing", () => {
    const { container, rerender } = render(
      <TraceScorePanel run={{ ...skipped, missing_values: [] }} />,
    );
    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(container.querySelector('[class*="border-orange-500"]')).toBeNull();

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
    expect(
      screen.getByText("The evaluators could not score this trace."),
    ).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toBeNull();

    rerender(<TraceScorePanel run={{ ...skipped, status: "pending" }} />);
    expect(
      screen.getByText("Running the evaluators on this trace"),
    ).toBeInTheDocument();
    expect(container.querySelector(".evaluator-card")).toBeNull();
  });
});

describe("evaluators not configured for traces", () => {
  const NOTE = "Did not run as it has not been configured for traces";
  const unconfigured = [
    { evaluator_uuid: "ev-5", name: "Accuracy" },
    { evaluator_uuid: "ev-9", name: "Agrees with the nurse" },
  ];
  const recorded: TraceScoringRun = {
    ...completed,
    unconfigured_evaluators: unconfigured,
  };

  it("shows one card per evaluator with the note and a Configure button for it", async () => {
    const user = setupUser();
    const onConfigure = jest.fn();
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={unconfigured}
        onConfigure={onConfigure}
      />,
    );
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getByText("Agrees with the nurse")).toBeInTheDocument();
    expect(screen.getAllByText(NOTE)).toHaveLength(2);
    expect(screen.getAllByText(NOTE)[0]).toHaveClass("text-orange-700");
    expect(
      screen.getByText("Accuracy").closest('[class*="border-orange-500"]'),
    ).not.toBeNull();
    expect(screen.getByText("Accuracy").querySelector("svg")).not.toBeNull();

    await user.click(screen.getAllByRole("button", { name: "Configure for traces" })[1]);
    expect(onConfigure).toHaveBeenCalledWith("ev-9");
  });

  it("keeps the button on screen and busy while its evaluator loads", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={unconfigured}
        onConfigure={jest.fn()}
        configuringUuid="ev-5"
      />,
    );
    const [first, second] = screen.getAllByRole("button", {
      name: /Configure/,
    });
    expect(first).toBeDisabled();
    expect(second).toBeEnabled();
  });

  it("leaves out an evaluator the run already names as missing a value", () => {
    render(
      <TraceScorePanel
        run={{
          ...recorded,
          missing_values: [
            {
              evaluator_uuid: "ev-9",
              name: "Agrees with the nurse",
              variable: "nurse_reply",
              source: "labels",
            },
          ],
        }}
        unconfigured={unconfigured}
      />,
    );
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(screen.getAllByText("Agrees with the nurse")).toHaveLength(1);
  });

  it("shows no cards while the run is in progress, beside an error, or with none given", () => {
    const { rerender } = render(
      <TraceScorePanel
        run={{ ...recorded, status: "processing" }}
        unconfigured={unconfigured}
      />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    rerender(
      <TraceScorePanel
        run={recorded}
        error="Could not load"
        unconfigured={unconfigured}
      />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    rerender(<TraceScorePanel run={completed} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });

  it("names an evaluator configured since in the offer, not in a card", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={[]}
        scoringEvaluatorUuids={["ev-5", "ev-9"]}
      />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(
      screen.getByText("Accuracy").closest('[class*="border-orange-500"]'),
    ).toBeNull();
  });

  it("shows no card for an evaluator the run did not leave out", () => {
    render(<TraceScorePanel run={completed} unconfigured={unconfigured} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });

  it("shows only the cards still not configured, each with Configure", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={[
          { evaluator_uuid: "ev-9", name: "Agrees with the nurse" },
        ]}
        scoringEvaluatorUuids={["ev-5"]}
        onConfigure={jest.fn()}
      />,
    );
    expect(screen.getAllByText(NOTE)).toHaveLength(1);
    expect(
      screen.getByText("Accuracy").closest('[class*="border-orange-500"]'),
    ).toBeNull();
    const buttons = screen.getAllByRole("button", { name: "Configure for traces" });
    expect(buttons).toHaveLength(1);
    expect(
      screen
        .getByText("Agrees with the nurse")
        .closest('[class*="border-orange-500"]'),
    ).toContainElement(buttons[0]);
  });
});

describe("cards beside a skipped or failed run", () => {
  const NOTE = "Did not run as it has not been configured for traces";
  const unconfigured = [{ evaluator_uuid: "ev-5", name: "Accuracy" }];

  it.each(["no_usable_evaluators", "missing_trace_values"])(
    "shows them when the run was skipped for %s",
    (reason) => {
      render(
        <TraceScorePanel
          run={{
            ...completed,
            status: "skipped",
            error: reason,
            results: [],
            unconfigured_evaluators: unconfigured,
          }}
          unconfigured={unconfigured}
        />,
      );
      expect(screen.getByText(NOTE)).toBeInTheDocument();
    },
  );

  it.each([
    ["skipped", "over_limit"],
    ["skipped", "no_tool_call_evaluator"],
    ["skipped", "scoring_disabled"],
    ["failed", "missing_trace_values"],
  ] as const)("leaves them out when the run is %s for %s", (status, reason) => {
    render(
      <TraceScorePanel
        run={{
          ...completed,
          status,
          error: reason,
          results: [],
          unconfigured_evaluators: unconfigured,
        }}
        unconfigured={unconfigured}
      />,
    );
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
  });
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
  // The button sits under the amber box, not inside it.
  expect(sentence.closest(".border-amber-500\\/40")).not.toContainElement(
    button,
  );
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

const toolCallSkip: TraceScoringRun = {
  run_uuid: "r20",
  status: "skipped",
  created_at: "2026-08-29T12:00:00Z",
  error: "no_tool_call_evaluator",
  results: [],
};

it("names what can score a tool-only trace now and offers only Score this trace, not the add button", () => {
  render(
    <TraceScorePanel
      run={toolCallSkip}
      scoreTrace={<button type="button">Score this trace</button>}
      scoringEvaluatorNames={["Tool call correctness"]}
      addToolCallEvaluator={
        <button type="button">Add a tool call evaluator</button>
      }
    />,
  );
  expect(document.body).toHaveTextContent(
    "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent. Tool call correctness can score it now.",
  );
  expect(
    screen.getByRole("button", { name: "Score this trace" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Add a tool call evaluator" }),
  ).not.toBeInTheDocument();
});

it("points at the Evaluators tab when a tool-only trace has no add button and nothing can score it", async () => {
  const onGoToEvaluators = jest.fn();
  const user = setupUser();
  render(
    <TraceScorePanel run={toolCallSkip} onGoToEvaluators={onGoToEvaluators} />,
  );
  await user.click(screen.getByRole("button", { name: /Evaluators tab/ }));
  expect(onGoToEvaluators).toHaveBeenCalled();
});

describe("a tool-only trace skipped before a tool call evaluator with variables was added", () => {
  const added = {
    evaluator_uuid: "ev-7",
    name: "Expected tool and arguments",
    reason: "declares_variables" as const,
  };
  const unconfigured = [{ evaluator_uuid: "ev-7", name: added.name }];

  it("asks to configure it, with its own card, when nothing can score the trace", async () => {
    const onConfigure = jest.fn();
    const user = setupUser();
    render(
      <TraceScorePanel
        run={toolCallSkip}
        ineligible={[added]}
        unconfigured={unconfigured}
        onConfigure={onConfigure}
        onGoToEvaluators={jest.fn()}
      />,
    );
    expect(document.body).toHaveTextContent(
      "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent. Expected tool and arguments has been added since, but has not been configured for traces. Configure it below, then score this trace.",
    );
    expect(
      screen.queryByRole("button", { name: /Evaluators tab/ }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Configure for traces" }),
    );
    expect(onConfigure).toHaveBeenCalledWith("ev-7");
  });

  it("shows its card beside an evaluator that can score the trace now", () => {
    render(
      <TraceScorePanel
        run={toolCallSkip}
        ineligible={[added]}
        unconfigured={unconfigured}
        onConfigure={jest.fn()}
        scoreTrace={<button type="button">Score this trace</button>}
        scoringEvaluatorNames={["Tool call correctness"]}
      />,
    );
    expect(document.body).toHaveTextContent(
      "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent. Tool call correctness can score it now. Expected tool and arguments has been added since, but has not been configured for traces. Configure it below.",
    );
    expect(document.body).toHaveTextContent(
      "Expected tool and argumentsConfigure for tracesDid not run as it has not been configured for traces",
    );
  });

  it("names every evaluator still to configure", () => {
    render(
      <TraceScorePanel
        run={toolCallSkip}
        ineligible={[added, { ...added, evaluator_uuid: "ev-8", name: "Right date" }]}
        unconfigured={[...unconfigured, { evaluator_uuid: "ev-8", name: "Right date" }]}
        onConfigure={jest.fn()}
      />,
    );
    expect(document.body).toHaveTextContent(
      "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent. Expected tool and arguments and Right date have been added since, but have not been configured for traces. Configure them below, then score this trace.",
    );
  });

  it("drops the card once it has been configured", () => {
    render(
      <TraceScorePanel
        run={toolCallSkip}
        ineligible={[added]}
        unconfigured={[]}
        onConfigure={jest.fn()}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Configure for traces" }),
    ).not.toBeInTheDocument();
  });
});

describe("scoring a trace again with evaluators set up since", () => {
  const OFFER =
    /These evaluators were not set up when this trace was scored, and can score it now:/;
  const recorded: TraceScoringRun = {
    ...completed,
    unconfigured_evaluators: [
      { evaluator_uuid: "ev-5", name: "Correctness" },
      { evaluator_uuid: "ev-6", name: "Tone check" },
      { evaluator_uuid: "ev-9", name: "Accuracy" },
    ],
  };
  const again = <button type="button">Score this trace again</button>;

  it("names the evaluators set up since in one box with one button, and keeps the card for the one still not set up", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={[{ evaluator_uuid: "ev-9", name: "Accuracy" }]}
        scoringEvaluatorUuids={["ev-5", "ev-6"]}
        scoreAgain={again}
      />,
    );
    const box = screen.getByText(OFFER);
    expect(box).toHaveTextContent(
      "can score it now: Correctness and Tone check",
    );
    expect(box).not.toHaveTextContent("Accuracy");
    expect(screen.getByText("Correctness").className).toContain("rounded-md");
    expect(
      screen.getAllByRole("button", { name: "Score this trace again" }),
    ).toHaveLength(1);
    expect(
      screen.getByText("Did not run as it has not been configured for traces"),
    ).toBeInTheDocument();
  });

  it("offers only the evaluators that can score the trace now", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={[]}
        scoringEvaluatorUuids={["ev-6", "ev-7"]}
        scoreAgain={again}
      />,
    );
    const box = screen.getByText(OFFER);
    expect(box).toHaveTextContent("can score it now: Tone check");
    expect(box).not.toHaveTextContent("Correctness");
  });

  it("offers nothing when no evaluator can score the trace now", () => {
    // Scoring off, evaluators removed from the agent, or not loaded yet.
    render(
      <TraceScorePanel run={recorded} unconfigured={[]} scoreAgain={again} />,
    );
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Score this trace again" }),
    ).not.toBeInTheDocument();
  });

  it("offers nothing while every recorded evaluator is still not set up", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={recorded.unconfigured_evaluators}
        scoreAgain={again}
      />,
    );
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Score this trace again" }),
    ).not.toBeInTheDocument();
  });

  it("shows the scores carried over while the remaining evaluators run", () => {
    render(
      <TraceScorePanel
        run={{
          ...completed,
          status: "processing",
          completed_at: null,
          newly_scored_evaluators: [
            { evaluator_uuid: "ev-5", name: "Correctness" },
            { evaluator_uuid: "ev-6", name: "Tone check" },
          ],
        }}
        unconfigured={[]}
        scoreAgain={again}
      />,
    );
    expect(screen.getByTestId("verdict-Tone")).toBeInTheDocument();
    expect(screen.getByTestId("verdict-Helpfulness")).toBeInTheDocument();
    expect(
      screen.getByText("Running the remaining evaluators on this trace"),
    ).toBeInTheDocument();
    expect(screen.queryByText(OFFER)).not.toBeInTheDocument();
  });

  it("keeps the plain running line for a normal run", () => {
    render(
      <TraceScorePanel
        run={{ ...completed, status: "pending", results: [], newly_scored_evaluators: [] }}
      />,
    );
    expect(
      screen.getByText("Running the evaluators on this trace"),
    ).toBeInTheDocument();
  });
});
