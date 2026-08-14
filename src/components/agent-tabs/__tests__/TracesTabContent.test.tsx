import { render, screen, waitFor, setupUser } from "@/test-utils";
import { TracesTabContent } from "../TracesTabContent";
import type { TraceSummary } from "@/lib/tracesApi";

// The list itself comes from `useTraces`; this test drives it directly so the
// tab's own behaviour (toolbar, selection, empty state) is what's exercised.
const mockUseTraces = jest.fn();
const handleDeleted = jest.fn();

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useTraces: (args: unknown) => mockUseTraces(args),
  // Selection is real: the convert/delete buttons only appear once a row is
  // ticked, which is what the last test checks.
  useTraceDeletion: jest.requireActual("../../../hooks/useTraceDeletion")
    .useTraceDeletion,
  useDialogUrlParam: () => ({ setParam: jest.fn() }),
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
jest.mock("../../traces/ConvertTracesToTestsDialog", () => ({
  ConvertTracesToTestsDialog: ({
    isOpen,
    agentUuid,
    traceUuids,
  }: {
    isOpen: boolean;
    agentUuid: string;
    traceUuids: string[];
  }) =>
    isOpen ? (
      <div data-testid="convert-dialog">
        <span data-testid="convert-agent">{agentUuid}</span>
        <span data-testid="convert-traces">{traceUuids.join(",")}</span>
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
    expect(screen.getByText("Showing 1–1 of 1")).toBeInTheDocument();
    expect(mockUseTraces).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1", q: "" }),
    );
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

  it("reveals the convert and delete actions once a trace is selected", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    expect(screen.queryByText(/Convert to tests/)).not.toBeInTheDocument();

    await user.click(screen.getAllByLabelText("Select trace")[0]);

    expect(screen.getByText("Convert to tests (1)")).toBeInTheDocument();
    expect(screen.getByText("Delete selected (1)")).toBeInTheDocument();
  });

  it("opens the convert dialog for this agent and the selected traces", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Convert to tests (1)"));

    expect(screen.getByTestId("convert-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("convert-agent")).toHaveTextContent("agent-1");
    expect(screen.getByTestId("convert-traces")).toHaveTextContent("trace-1");
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

  it("deletes every trace matching the filter for this agent", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    // The "delete everything matching" button only appears once a filter is on.
    await user.click(screen.getAllByTitle("Show this conversation")[0]);
    await user.click(screen.getByText("Delete all 1 matching"));
    await user.click(screen.getByRole("button", { name: "Delete all" }));

    await waitFor(() =>
      expect(bulkDeleteMatchingTraces).toHaveBeenCalledWith(
        "test-token",
        expect.objectContaining({
          agentId: "agent-1",
          conversationId: "conv-001",
        }),
      ),
    );
  });

  it("narrows the list to one conversation, and clears it again", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    expect(lastTracesArgs().conversationId).toBeNull();

    await user.click(screen.getAllByTitle("Show this conversation")[0]);
    expect(lastTracesArgs().conversationId).toBe("conv-001");

    await user.click(screen.getByTitle("Clear conversation filter"));
    expect(lastTracesArgs().conversationId).toBeNull();
  });

  it("says nothing matched when a filter leaves no traces", async () => {
    const user = setupUser();
    mockUseTraces.mockImplementation((args: { conversationId: string | null }) =>
      tracesResult(args.conversationId ? [] : [trace()]),
    );
    render(<TracesTabContent agentUuid="agent-1" />);

    await user.click(screen.getAllByTitle("Show this conversation")[0]);

    expect(screen.getByText("No traces match your filters.")).toBeInTheDocument();
    // Not the "this agent has no traces at all" screen.
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });
});
