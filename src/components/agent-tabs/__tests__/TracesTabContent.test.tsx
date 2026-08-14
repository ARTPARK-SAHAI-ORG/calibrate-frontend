import { render, screen, waitFor, setupUser } from "@/test-utils";
jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
import { toast } from "sonner";
import { TracesTabContent } from "../TracesTabContent";
import type { TraceSummary } from "@/lib/tracesApi";

// The list itself comes from `useTraces`; this test drives it directly so the
// tab's own behaviour (toolbar, selection, empty state) is what's exercised.
const mockUseTraces = jest.fn();
const mockUseDialogUrlParam = jest.fn(() => ({ setParam: jest.fn() }));
const handleDeleted = jest.fn();

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useTraces: (args: unknown) => mockUseTraces(args),
  // Selection is real: the convert/delete buttons only appear once a row is
  // ticked, which the selection tests exercise.
  useTraceDeletion: jest.requireActual("../../../hooks/useTraceDeletion")
    .useTraceDeletion,
  useDialogUrlParam: (args: unknown) => mockUseDialogUrlParam(args),
}));

const bulkDeleteMatchingTraces = jest.fn();
jest.mock("../../../lib/tracesApi", () => ({
  bulkDeleteMatchingTraces: (...args: unknown[]) =>
    bulkDeleteMatchingTraces(...args),
}));

// The stub exposes the check callback so a test can prove the tab wires its
// own refetch into the setup steps.
jest.mock("../../traces/TracesEmptyState", () => ({
  TracesEmptyState: ({ onCheckForTraces }: { onCheckForTraces: () => void }) => (
    <div data-testid="traces-empty-state">
      <button type="button" onClick={onCheckForTraces}>
        check
      </button>
    </div>
  ),
}));
// The stubs print the props that carry the agent and the trace, so a test can
// check the dialogs were opened for the right one instead of only that they
// opened at all.
jest.mock("../../traces/TraceDetailDialog", () => ({
  TraceDetailDialog: ({
    isOpen,
    traceUuid,
  }: {
    isOpen: boolean;
    traceUuid: string | null;
  }) => (isOpen ? <div data-testid="trace-detail">{traceUuid}</div> : null),
}));
// The stub also exposes onConverted, so the "created N tests" message the tab
// builds from the response is exercised rather than assumed.
jest.mock("../../traces/ConvertTracesToTestsDialog", () => ({
  ConvertTracesToTestsDialog: ({
    isOpen,
    agentUuid,
    traceUuids,
    testType,
    onConverted,
  }: {
    isOpen: boolean;
    agentUuid: string;
    traceUuids: string[];
    testType: "response" | "tool_call";
    onConverted: (result: { test_uuids: string[] }) => void;
  }) =>
    isOpen ? (
      <div data-testid="convert-dialog">
        <span data-testid="convert-agent">{agentUuid}</span>
        <span data-testid="convert-traces">{traceUuids.join(",")}</span>
        <span data-testid="convert-type">{testType}</span>
        <button
          type="button"
          onClick={() => onConverted({ test_uuids: ["t1", "t2"] })}
        >
          finish adding
        </button>
      </div>
    ) : null,
}));

const trace = (over: Partial<TraceSummary> = {}): TraceSummary => ({
  uuid: "trace-1",
  agent_id: "agent-1",
  message_id: "msg-001",
  conversation_id: "conv-001",
  input_preview: "When is the next vaccination?",
  response_preview: "At 14 weeks.",
  turn_count: 1,
  tool_call_count: 0,
  metadata_count: 0,
  created_at: "2026-01-01T00:00:00Z",
  ...over,
});

const refetch = jest.fn();

function tracesResult(items: TraceSummary[]) {
  return {
    items,
    total: items.length,
    offset: 0,
    isLoading: false,
    error: null,
    handleDeleted,
    refetch,
    hasPrev: false,
    hasNext: false,
    prevPage: jest.fn(),
    nextPage: jest.fn(),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockUseTraces.mockReturnValue(tracesResult([trace()]));
  bulkDeleteMatchingTraces.mockResolvedValue({ deleted: 1 });
});

/** The last arguments `useTraces` was called with, i.e. what is on screen now. */
function lastTracesArgs() {
  return mockUseTraces.mock.calls[mockUseTraces.mock.calls.length - 1][0];
}

describe("TracesTabContent", () => {
  it("lists the loaded traces for this agent", () => {
    render(<TracesTabContent agentUuid="agent-1" />);

    expect(screen.getAllByText("msg-001").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("When is the next vaccination?").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("1 trace")).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(mockUseTraces).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", q: "" }),
    );
    expect(lastTracesArgs()).not.toHaveProperty("conversationId");
    expect(mockUseDialogUrlParam).toHaveBeenCalledWith(
      expect.objectContaining({ param: "traceId" }),
    );
    expect(mockUseDialogUrlParam).not.toHaveBeenCalledWith(
      expect.objectContaining({ param: "conversation_id" }),
    );
  });

  it("shows the server total above the rows and pagination below them", async () => {
    const user = setupUser();
    const nextPage = jest.fn();
    mockUseTraces.mockReturnValue({
      ...tracesResult([trace()]),
      total: 3,
      hasNext: true,
      nextPage,
    });

    render(<TracesTabContent agentUuid="agent-1" />);

    const count = screen.getByText("3 traces");
    const list = count.nextElementSibling;
    const nextButton = screen.getByRole("button", { name: "Next" });

    expect(list).toHaveTextContent("Input");
    expect(
      list!.compareDocumentPosition(nextButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(nextButton);
    expect(nextPage).toHaveBeenCalledTimes(1);
  });

  it("passes what was typed in the search box to the trace list", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.type(screen.getByPlaceholderText("Search traces"), "vaccine");

    await waitFor(() =>
      expect(mockUseTraces).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent-1", q: "vaccine" }),
      ),
    );
  });

  it("shows the empty state when the agent has no traces", () => {
    mockUseTraces.mockReturnValue(tracesResult([]));

    render(<TracesTabContent agentUuid="agent-1" />);

    expect(screen.getByTestId("traces-empty-state")).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Search traces"),
    ).not.toBeInTheDocument();
  });

  it("gives the setup steps a way to look for traces again", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(tracesResult([]));
    render(<TracesTabContent agentUuid="agent-1" />);

    // Nothing happens until the reader asks: no timers, no background checks.
    expect(refetch).not.toHaveBeenCalled();

    await user.click(screen.getByText("check"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("reveals the add and delete actions once a trace is selected", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    expect(screen.queryByText(/Add to tests/)).not.toBeInTheDocument();

    await user.click(screen.getAllByLabelText("Select trace")[0]);

    expect(screen.getByText("Add to tests (1)")).toBeInTheDocument();
    expect(screen.getByText("Delete selected (1)")).toBeInTheDocument();
  });

  it("warns that single and bulk deletion cannot be undone", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByTitle("Delete trace")[0]);
    expect(screen.getByText("Delete this trace?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Deleting frees workspace capacity. This cannot be undone.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Delete selected (1)"));

    expect(screen.getByText("Delete 1 trace?")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Deleting frees workspace capacity. This cannot be undone.",
      ),
    ).toBeInTheDocument();
  });

  it("says how many tests were created, counting what came back", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));
    await user.click(screen.getByText("finish adding"));

    // Two uuids came back, so the message says two, and the selection clears.
    expect(toast.success).toHaveBeenCalledWith(
      "Created 2 tests",
      expect.anything(),
    );
    expect(screen.queryByText("Add to tests (1)")).not.toBeInTheDocument();
  });

  it("opens the add dialog with response type when a selected trace has a response", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));

    expect(screen.getByTestId("convert-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("convert-agent")).toHaveTextContent("agent-1");
    expect(screen.getByTestId("convert-traces")).toHaveTextContent("trace-1");
    expect(screen.getByTestId("convert-type")).toHaveTextContent("response");
  });

  it("uses tool-call type only when every selected trace is tool-call-only", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace({
          response_preview: null,
          tool_call_count: 1,
        }),
      ]),
    );
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));

    expect(screen.getByTestId("convert-type")).toHaveTextContent("tool_call");
  });

  it("uses response type for a mixed response and tool-call-only selection", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace(),
        trace({
          uuid: "trace-2",
          message_id: "msg-002",
          response_preview: null,
          tool_call_count: 1,
        }),
      ]),
    );
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Add to tests (2)"));

    expect(screen.getByTestId("convert-type")).toHaveTextContent("response");
  });

  it("opens the detail view for the trace that was clicked", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace(),
        trace({ uuid: "trace-2", message_id: "msg-002", input_preview: "Second" }),
      ]),
    );
    render(<TracesTabContent agentUuid="agent-1" />);

    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();

    await user.click(screen.getAllByText("msg-002")[0]);

    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");
  });

  it("deletes every trace matching the current search for this agent", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.type(screen.getByPlaceholderText("Search traces"), "vaccine");
    await waitFor(() =>
      expect(mockUseTraces).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: "agent-1", q: "vaccine" }),
      ),
    );

    await user.click(screen.getByText("Delete all 1 matching"));
    expect(
      screen.getByText(
        "Every trace matching the current search will be deleted, including traces not shown on this page. This frees workspace capacity and cannot be undone.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() =>
      expect(bulkDeleteMatchingTraces).toHaveBeenCalledWith(
        "test-token",
        {
          agentId: "agent-1",
          q: "vaccine",
        },
      ),
    );
  });

  it("keeps an empty search result separate from the agent empty state", async () => {
    const user = setupUser();
    mockUseTraces.mockImplementation((args: { q: string }) =>
      tracesResult(args.q ? [] : [trace()]),
    );
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.type(screen.getByPlaceholderText("Search traces"), "missing");

    await waitFor(() =>
      expect(
        screen.getByText("No traces match your search."),
      ).toBeInTheDocument(),
    );
    // Not the "this agent has no traces at all" screen.
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });
});
