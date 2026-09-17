import { render, screen } from "@/test-utils";
import { TraceScoreCells } from "../TraceScoringSummary";

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

it("shows one spinner across every column while scoring is waiting or running", () => {
  const { rerender } = render(
    <TraceScoreCells
      trace={{ latest_run_status: "pending" }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByLabelText("Scoring").parentElement).toHaveStyle({
    gridColumn: "span 2",
  });
  rerender(
    <TraceScoreCells
      trace={{ latest_run_status: "processing" }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByLabelText("Scoring")).toBeInTheDocument();
  expect(screen.queryByText("—")).not.toBeInTheDocument();
});

it("shows Success or Fail for a binary evaluator and the number for a rating one", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        scores: [
          { evaluator_uuid: "ev-1", output_type: "binary", value: 0, passed: false },
          { evaluator_uuid: "ev-2", output_type: "rating", value: 3, passed: true },
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
        scores: [
          { evaluator_uuid: "ev-1", output_type: "binary", value: 1, passed: true },
        ],
      }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Success")).toBeInTheDocument();
  expect(screen.getByText("—")).toBeInTheDocument();
});

it("shows one Failed or Skipped pill across every column", () => {
  const { rerender } = render(
    <TraceScoreCells
      trace={{ latest_run_status: "failed" }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Failed").parentElement).toHaveStyle({
    gridColumn: "span 2",
  });
  rerender(
    <TraceScoreCells
      trace={{ latest_run_status: "skipped" }}
      columns={columns}
      layout="row"
    />,
  );
  expect(screen.getByText("Skipped")).toBeInTheDocument();
});

it("labels each evaluator on a mobile card", () => {
  render(
    <TraceScoreCells
      trace={{
        latest_run_status: "completed",
        scores: [
          { evaluator_uuid: "ev-1", output_type: "binary", value: 1, passed: true },
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

it("shows one spinner and no labels on a mobile card while scoring runs", () => {
  render(
    <TraceScoreCells
      trace={{ latest_run_status: "pending" }}
      columns={columns}
      layout="card"
    />,
  );
  expect(screen.getByLabelText("Scoring")).toBeInTheDocument();
  expect(screen.queryByText("Tone")).not.toBeInTheDocument();
});
