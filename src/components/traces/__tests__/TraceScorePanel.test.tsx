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
    "Tone check: has not been configured for traces. Configure it in the Evaluators tab",
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
    expect(
      screen.getByRole("button", { name: "Score this trace" }),
    ).toBeInTheDocument();
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
    />,
  );
  expect(screen.getAllByText("Tone check")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Configure" })).toBeInTheDocument();
});

it("leaves out of the list only the evaluators the run recorded as not configured", () => {
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
      unconfigured={[{ evaluator_uuid: "e2", name: "Politeness" }]}
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

  it("names the metadata entry, and shows no general line on a skipped run", () => {
    const { container } = render(<TraceScorePanel run={skipped} />);

    const block = container.querySelector('[class*="border-orange-500"]');
    expect(block).toHaveTextContent(
      "Agrees with the nurseCould not run. {{nurse_reply}} reads from the metadata entry expert_answer, and this trace has none.",
    );
    expect(block?.querySelector("p.text-orange-700")).not.toBeNull();
    expect(block?.querySelector("svg")).not.toBeNull();
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
            `Could not run. {{x}} reads from ${words}, and this trace has none.`,
      ),
    ).toBeInTheDocument();
  });

  it.each([
    ["conversation", "input", "the conversation"],
    ["conversation", "output.response", "the agent reply"],
    ["general", "input", "the input"],
    ["general", "output.response", "the output"],
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
              `Could not run. {{x}} reads from ${words}, and this trace has none.`,
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
    expect(blocks[0]).toHaveTextContent("{{a}} reads from the labels");
    expect(blocks[0]).toHaveTextContent("{{b}} reads from the message ID");
    expect(blocks[0].querySelectorAll("p.text-orange-700")).toHaveLength(2);
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

    await user.click(screen.getAllByRole("button", { name: "Configure" })[1]);
    expect(onConfigure).toHaveBeenCalledWith("ev-9");
  });

  it("keeps the button on screen and busy while its evaluator loads", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={unconfigured}
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

  it("keeps a card for an evaluator configured since, with no Configure button", () => {
    render(<TraceScorePanel run={recorded} unconfigured={[]} />);
    expect(screen.getAllByText(NOTE)).toHaveLength(2);
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Configure" }),
    ).not.toBeInTheDocument();
  });

  it("shows no card for an evaluator the run did not leave out", () => {
    render(<TraceScorePanel run={completed} unconfigured={unconfigured} />);
    expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    expect(screen.queryByText("Accuracy")).not.toBeInTheDocument();
  });

  it("offers Configure only on the cards still not configured", () => {
    render(
      <TraceScorePanel
        run={recorded}
        unconfigured={[
          { evaluator_uuid: "ev-9", name: "Agrees with the nurse" },
        ]}
      />,
    );
    expect(screen.getAllByText(NOTE)).toHaveLength(2);
    const buttons = screen.getAllByRole("button", { name: "Configure" });
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
