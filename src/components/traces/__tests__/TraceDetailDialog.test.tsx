import { render, screen, waitFor } from "@/test-utils";
import { TraceDetailDialog } from "../TraceDetailDialog";
import { fetchTrace, TraceDetail } from "@/lib/tracesApi";

jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTrace: jest.fn(),
}));
jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchTrace = fetchTrace as jest.Mock;

const detail: TraceDetail = {
  uuid: "t1",
  message_id: "msg-1",
  conversation_id: "conv-1",
  input: [
    { role: "system", content: "You are a vaccination assistant." },
    { role: "user", content: "When is the next vaccination?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        { id: "c1", function: { name: "get_schedule", arguments: "{}" } },
      ],
    },
  ],
  output: {
    response: "At 14 weeks, for OPV and DPT.",
    tool_calls: [{ tool: "get_schedule", arguments: { child_age_weeks: 14 } }],
  },
  metadata: [{ key: "gen_ai.request.model", value: "gpt-4" }],
  created_at: "2026-07-20T10:00:00Z",
  updated_at: "2026-07-20T10:00:00Z",
};

beforeEach(() => mockFetchTrace.mockReset());

it("renders nothing when closed and never fetches", () => {
  const { container } = render(
    <TraceDetailDialog
      isOpen={false}
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );
  expect(container).toBeEmptyDOMElement();
  expect(mockFetchTrace).not.toHaveBeenCalled();
});

it("fetches and renders history, output, and metadata", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );

  await waitFor(() =>
    expect(screen.getByText("At 14 weeks, for OPV and DPT.")).toBeInTheDocument(),
  );
  expect(mockFetchTrace).toHaveBeenCalledWith("tok", "t1");
  // History turns.
  expect(
    screen.getByText("You are a vaccination assistant."),
  ).toBeInTheDocument();
  // Both the history turn and the output render get_schedule as a tool-call
  // table (name row + parameters section).
  expect(screen.getAllByText("get_schedule")).toHaveLength(2);
  expect(screen.getAllByText("tool call")).toHaveLength(2);
  expect(screen.getAllByText("parameters")).toHaveLength(2);
  // The output tool call breaks its arguments into name/value rows.
  expect(screen.getByText("child_age_weeks")).toBeInTheDocument();
  expect(screen.getByText("14")).toBeInTheDocument();
  // The empty-argument history call shows a "None" parameters row.
  expect(screen.getByText("None")).toBeInTheDocument();
  // Metadata.
  expect(screen.getByText("gen_ai.request.model")).toBeInTheDocument();
  expect(screen.getByText("gpt-4")).toBeInTheDocument();
});

it("shows a fallback when the output has no text response", async () => {
  mockFetchTrace.mockResolvedValue({
    ...detail,
    output: { response: null, tool_calls: [{ tool: "x" }] },
    metadata: null,
  });
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );
  await waitFor(() =>
    expect(screen.getByText("No text response")).toBeInTheDocument(),
  );
  // A tool-call-only output still renders its tool call as a table.
  expect(screen.getByText("x")).toBeInTheDocument();
});

it("surfaces an error when the fetch fails", async () => {
  mockFetchTrace.mockRejectedValue(new Error("boom"));
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );
  await waitFor(() =>
    expect(screen.getByText(/Failed to load this trace/)).toBeInTheDocument(),
  );
});
