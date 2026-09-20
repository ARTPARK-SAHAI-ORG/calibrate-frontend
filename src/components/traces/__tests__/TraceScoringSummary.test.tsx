import { render, screen, setupUser } from "@/test-utils";
import { TraceScoreCells, TraceScoreMark } from "../TraceScoringSummary";

const columns = [
  { evaluator_uuid: "ev-1", name: "Tone" },
  { evaluator_uuid: "ev-2", name: "Accuracy" },
];

it("renders nothing when there are no evaluator columns", () => {
  const { container } = render(
    <TraceScoreCells
      trace={{ latest_run_status: "completed" }}
      columns={[]}
      layout="row"
    />,
  );
  expect(container).toBeEmptyDOMElement();
});

it("shows a dash per column when this trace has never been scored", () => {
  render(<TraceScoreCells trace={{}} columns={columns} layout="row" />);
  expect(screen.getAllByText("Not scored yet")).toHaveLength(2);
});

it("shows the verdict for a yes-or-no evaluator and the score for a rating one", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          {
            evaluator_uuid: "ev-1",
            name: "ev-1",
            output_type: "binary",
            value: 0,
            passed: false,
          },
          {
            evaluator_uuid: "ev-2",
            name: "ev-2",
            output_type: "rating",
            value: 3,
            passed: true,
          },
        ],
      }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Wrong")).toBeInTheDocument();
  expect(screen.getByText("Score: 3")).toBeInTheDocument();
  expect(screen.queryByText(/passed/i)).not.toBeInTheDocument();
});

it("shows a dash for an evaluator the completed run has no score for", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          {
            evaluator_uuid: "ev-1",
            name: "ev-1",
            output_type: "binary",
            value: 1,
            passed: true,
          },
        ],
      }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Correct")).toBeInTheDocument();
  expect(screen.getByText("Not scored yet")).toBeInTheDocument();
});

it("labels each evaluator on a mobile card", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          {
            evaluator_uuid: "ev-1",
            name: "ev-1",
            output_type: "binary",
            value: 1,
            passed: true,
          },
        ],
      }}
      columns={columns}
      layout="card"
    />,
  );
  expect(screen.getByText("Tone")).toBeInTheDocument();
  expect(screen.getByText("Accuracy")).toBeInTheDocument();
  expect(screen.getByText("Correct")).toBeInTheDocument();
  expect(screen.getByText("Not scored yet")).toBeInTheDocument();
});

describe("TraceScoreMark", () => {
  it("says a trace was completed", () => {
    render(<TraceScoreMark trace={{ latest_run_status: "completed" }} />);
    expect(screen.getByRole("img", { name: "Completed" })).toBeInTheDocument();
  });

  it("says why on a trace the workspace limit refused", async () => {
    const user = setupUser();
    render(
      <TraceScoreMark
        trace={{ latest_run_status: "skipped", latest_run_error: "over_limit" }}
      />,
    );
    const mark = screen.getByRole("img", {
      name: "This workspace has reached its limit for scoring traces",
    });
    await user.hover(mark);
    expect(
      await screen.findByText(
        "This workspace has reached its limit for scoring traces",
      ),
    ).toBeInTheDocument();
  });

  it("says why on a trace whose scoring broke", () => {
    render(
      <TraceScoreMark
        trace={{
          latest_run_status: "failed",
          latest_run_error: "scoring_disabled",
        }}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "Monitoring was turned off before this trace was scored",
      }),
    ).toBeInTheDocument();
  });

  it("spins while the trace is waiting and while it is being scored", () => {
    const { rerender } = render(
      <TraceScoreMark trace={{ latest_run_status: "pending" }} />,
    );
    expect(
      screen.getByRole("img", { name: "Waiting to be scored" }),
    ).toBeInTheDocument();
    rerender(<TraceScoreMark trace={{ latest_run_status: "processing" }} />);
    expect(
      screen.getByRole("img", { name: "In progress" }),
    ).toBeInTheDocument();
  });

  it("spins in the same amber as the other marks, centred and never squashed", () => {
    render(<TraceScoreMark trace={{ latest_run_status: "processing" }} />);
    const mark = screen.getByRole("img", { name: "In progress" });
    // Centred inside its own box and held at its width, the way RunStateMark
    // draws the finished, stopped and error marks beside it.
    expect(mark.className).toContain("items-center");
    expect(mark.className).toContain("shrink-0");
    const spinner = mark.querySelector("svg");
    expect(spinner?.getAttribute("class")).toContain("text-amber-500");
    expect(spinner?.getAttribute("class")).not.toContain("text-muted-foreground");
  });

  it("draws nothing for a trace nothing has tried to score", () => {
    const { container } = render(<TraceScoreMark trace={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("a run that has not finished", () => {
  it("says so in every column while the trace waits and while it is scored", () => {
    const { rerender } = render(
      <TraceScoreCells
        trace={{ latest_run_status: "pending" }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("In progress")).toHaveLength(2);
    expect(screen.queryByText("Not scored yet")).not.toBeInTheDocument();
    // Amber, the same colour the mark beside the input uses.
    expect(screen.getAllByText("In progress")[0].className).toMatch(/amber/);

    rerender(
      <TraceScoreCells
        trace={{
          latest_run_status: "processing",
          results: [
            {
              evaluator_uuid: "ev-1",
              name: "Tone",
              output_type: "binary",
              value: 1,
              passed: true,
            },
          ],
        }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("In progress")).toHaveLength(2);
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
  });
});

describe("a run that could not be run", () => {
  it("says so in every column when the run failed", () => {
    render(
      <TraceScoreCells
        trace={{
          latest_run_status: "failed",
          latest_run_error: "scoring_disabled",
        }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("Could not run")).toHaveLength(2);
    expect(screen.queryByText("Not scored yet")).not.toBeInTheDocument();
  });

  it("says so in every column when the run was skipped", () => {
    render(
      <TraceScoreCells
        trace={{ latest_run_status: "skipped", latest_run_error: "over_limit" }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("Could not run")).toHaveLength(2);
  });

  it("labels each column on a mobile card too", () => {
    render(
      <TraceScoreCells
        trace={{ latest_run_status: "failed" }}
        columns={columns}
        layout="card"
      />,
    );
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.getByText("Accuracy")).toBeInTheDocument();
    expect(screen.getAllByText("Could not run")).toHaveLength(2);
  });

  it("still says a completed run is waiting on the evaluator it has no score for", () => {
    render(
      <TraceScoreCells
        trace={{
          latest_run_status: "completed",
          results: [
            {
              evaluator_uuid: "ev-1",
              name: "Tone",
              output_type: "binary",
              value: 1,
              passed: true,
            },
          ],
        }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getByText("Not scored yet")).toBeInTheDocument();
    expect(screen.queryByText("Could not run")).not.toBeInTheDocument();
  });

  it("still says a run in progress is in progress", () => {
    const { rerender } = render(
      <TraceScoreCells
        trace={{ latest_run_status: "pending" }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("In progress")).toHaveLength(2);
    expect(screen.queryByText("Could not run")).not.toBeInTheDocument();
    rerender(
      <TraceScoreCells
        trace={{ latest_run_status: "processing" }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getAllByText("In progress")).toHaveLength(2);
    expect(screen.queryByText("Could not run")).not.toBeInTheDocument();
  });
});

describe("a rating evaluator", () => {
  it("shows the score out of its scale", () => {
    render(
      <TraceScoreCells
        trace={{
          latest_run_status: "completed",
          results: [
            {
              evaluator_uuid: "ev-1",
              name: "Tone",
              output_type: "rating",
              value: 3,
              scale_min: 1,
              scale_max: 5,
              passed: true,
            },
          ],
        }}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });
});

describe("the judge's reasoning", () => {
  function withReasoning(reasoning: string | null) {
    return {
      latest_run_status: "completed" as const,
      results: [
        {
          evaluator_uuid: "ev-1",
          name: "Tone",
          output_type: "binary" as const,
          value: 1,
          passed: true,
          reasoning,
        },
      ],
    };
  }

  it("hides it behind an information icon beside the verdict", async () => {
    const user = setupUser();
    render(
      <TraceScoreCells
        trace={withReasoning("The reply stayed warm throughout.")}
        columns={columns}
        layout="row"
      />,
    );
    const icon = screen.getByRole("button", { name: "View Tone reasoning" });
    await user.hover(icon);
    expect(
      await screen.findByText("The reply stayed warm throughout."),
    ).toBeInTheDocument();
  });

  it("shows no icon when the judge gave no reasoning", () => {
    const { rerender } = render(
      <TraceScoreCells
        trace={withReasoning(null)}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    // Whitespace is nothing to read either.
    rerender(
      <TraceScoreCells
        trace={withReasoning("   ")}
        columns={columns}
        layout="row"
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });
});
