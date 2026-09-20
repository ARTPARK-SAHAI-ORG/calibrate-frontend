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
  expect(screen.getAllByText("—")).toHaveLength(2);
});


it("shows Success or Fail for a binary evaluator and the number for a rating one", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          { evaluator_uuid: "ev-1", name: "ev-1", output_type: "binary", value: 0, passed: false },
          { evaluator_uuid: "ev-2", name: "ev-2", output_type: "rating", value: 3, passed: true },
        ],
      }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Fail")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
  expect(screen.queryByText(/passed/i)).not.toBeInTheDocument();
});

it("shows a dash for an evaluator the completed run has no score for", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          { evaluator_uuid: "ev-1", name: "ev-1", output_type: "binary", value: 1, passed: true },
        ],
      }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Success")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
});


it("labels each evaluator on a mobile card", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        results: [
          { evaluator_uuid: "ev-1", name: "ev-1", output_type: "binary", value: 1, passed: true },
        ],
      }}
      columns={columns}
      layout="card"
    />,
  );
  expect(screen.getByText("Tone")).toBeInTheDocument();
  expect(screen.getByText("Accuracy")).toBeInTheDocument();
  expect(screen.getByText("Success")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
});



describe("TraceScoreMark", () => {
  it("says a trace was scored", () => {
    render(<TraceScoreMark trace={{ latest_run_status: "completed" }} />);
    expect(screen.getByRole("img", { name: "Scored" })).toBeInTheDocument();
  });

  it("says why on a trace the workspace limit refused", async () => {
    const user = setupUser();
    render(
      <TraceScoreMark
        trace={{ latest_run_status: "skipped", latest_run_error: "over_limit" }}
      />,
    );
    const mark = screen.getByRole("img", {
      name: "This workspace has scored as many traces as its limit allows",
    });
    await user.hover(mark);
    expect(
      await screen.findByText(
        "This workspace has scored as many traces as its limit allows",
      ),
    ).toBeInTheDocument();
  });

  it("says why on a trace whose scoring broke", () => {
    render(
      <TraceScoreMark
        trace={{ latest_run_status: "failed", latest_run_error: "agent_deleted" }}
      />,
    );
    expect(
      screen.getByRole("img", {
        name: "This agent was deleted before scoring finished",
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
      screen.getByRole("img", { name: "Being scored" }),
    ).toBeInTheDocument();
  });

  it("draws nothing for a trace nothing has tried to score", () => {
    const { container } = render(<TraceScoreMark trace={{}} />);
    expect(container).toBeEmptyDOMElement();
  });
});
