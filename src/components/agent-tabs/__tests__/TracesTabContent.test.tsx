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
const mockUseDialogUrlParam = jest.fn((_args: unknown) => ({
  setParam: jest.fn(),
}));
const handleDeleted = jest.fn();

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useTraces: (args: unknown) => mockUseTraces(args),
  // Selection is real: the convert/delete buttons only appear once a row is
  // ticked, which the selection tests exercise.
  useTraceDeletion: jest.requireActual("../../../hooks/useTraceDeletion")
    .useTraceDeletion,
  useDialogUrlParam: (args: unknown) => mockUseDialogUrlParam(args),
  // The remembered page size is real, so choosing one is exercised end to end.
  usePageSize: jest.requireActual("../../../hooks/usePageSize").usePageSize,
  PAGE_SIZE_OPTIONS: jest.requireActual("../../../hooks/usePageSize")
    .PAGE_SIZE_OPTIONS,
}));

const bulkDeleteMatchingTraces = jest.fn();
const fetchTrace = jest.fn();
jest.mock("../../../lib/tracesApi", () => ({
  bulkDeleteMatchingTraces: (...args: unknown[]) =>
    bulkDeleteMatchingTraces(...args),
  fetchTrace: (...args: unknown[]) => fetchTrace(...args),
}));

const reportError = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

// The evaluator step is stubbed down to its one outcome: the reader picks
// evaluators and continues.
jest.mock("../../traces/TraceLabellingEvaluatorsDialog", () => ({
  TraceLabellingEvaluatorsDialog: ({
    isOpen,
    agentUuid,
    onChosen,
  }: {
    isOpen: boolean;
    agentUuid: string;
    onChosen: (evaluators: { uuid: string; name?: string }[]) => void;
  }) =>
    isOpen ? (
      <div data-testid="labelling-evaluators">
        <span data-testid="labelling-evaluators-agent">{agentUuid}</span>
        <button
          type="button"
          onClick={() => onChosen([{ uuid: "ev-1", name: "Correctness" }])}
        >
          choose evaluators
        </button>
      </div>
    ) : null,
}));
// The stub prints what the dialog was handed, so the mapping from traces to
// labelling items is exercised rather than assumed.
jest.mock("../../human-labelling/AddRunToLabellingTaskDialog", () => ({
  AddRunToLabellingTaskDialog: ({
    isOpen,
    source,
    onAdded,
  }: {
    isOpen: boolean;
    source: {
      type: string;
      agentUuid: string;
      traces: { name: string; input: unknown[]; output: unknown }[];
      evaluators?: { uuid: string }[];
    };
    onAdded?: (taskUuid: string, itemsCreated: number) => void;
  }) =>
    isOpen ? (
      <div data-testid="labelling-task">
        <span data-testid="labelling-source">{source.type}</span>
        <span data-testid="labelling-agent">{source.agentUuid}</span>
        <span data-testid="labelling-payload">
          {JSON.stringify(source.traces)}
        </span>
        <span data-testid="labelling-evaluator-uuids">
          {(source.evaluators ?? []).map((e) => e.uuid).join(",")}
        </span>
        <button type="button" onClick={() => onAdded?.("task-1", 1)}>
          finish labelling
        </button>
      </div>
    ) : null,
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
  window.localStorage.clear();
  mockUseTraces.mockReturnValue(tracesResult([trace()]));
  bulkDeleteMatchingTraces.mockResolvedValue({ deleted: 1 });
});

/** The last arguments `useTraces` was called with, i.e. what is on screen now. */
function lastTracesArgs() {
  return mockUseTraces.mock.calls[mockUseTraces.mock.calls.length - 1][0];
}

describe("TracesTabContent", () => {
  it("keeps the sending code reachable once traces exist", async () => {
    const user = setupUser();
    render(<TracesTabContent agentUuid="agent-1" />);

    // The setup steps are gone at this point, so this is the only way back to
    // the request: no selection needed.
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View code" }));

    expect(
      screen.getByRole("heading", { name: "Send a trace" }),
    ).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain(
      '"agent_id": "agent-1"',
    );
  });

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

  it("hides the per page choice while every trace fits on one page", () => {
    mockUseTraces.mockReturnValue({ ...tracesResult([trace()]), total: 10 });
    render(<TracesTabContent agentUuid="agent-1" />);
    expect(screen.queryByLabelText("Per page")).not.toBeInTheDocument();
  });

  it("lets the reader change how many traces a page holds", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue({
      ...tracesResult([trace()]),
      total: 11,
      hasNext: true,
    });

    render(<TracesTabContent agentUuid="agent-1" />);

    await user.selectOptions(screen.getByLabelText("Per page"), "25");
    await waitFor(() => expect(lastTracesArgs().pageSize).toBe(25));
    expect(window.localStorage.getItem("calibrate:items-page-size")).toBe("25");
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

  describe("submitting traces for labelling", () => {
    const detail = (over: Record<string, unknown> = {}) => ({
      uuid: "trace-1",
      message_id: "msg-001",
      input: [{ role: "user", content: "When is the next vaccination?" }],
      output: { response: "At 14 weeks.", tool_calls: null },
      ...over,
    });

    beforeEach(() => {
      fetchTrace.mockImplementation(async (_token: string, uuid: string) =>
        detail({ uuid, message_id: uuid === "trace-2" ? null : "msg-001" }),
      );
    });

    it("offers the labelling action only once a trace is selected", async () => {
      const user = setupUser();
      render(<TracesTabContent agentUuid="agent-1" />);

      expect(
        screen.queryByText(/Submit for labelling/),
      ).not.toBeInTheDocument();

      await user.click(screen.getAllByLabelText("Select trace")[0]);

      expect(screen.getByText("Submit for labelling (1)")).toBeInTheDocument();
    });

    it("asks for evaluators, then hands the full traces to the task dialog", async () => {
      const user = setupUser();
      mockUseTraces.mockReturnValue(
        tracesResult([
          trace(),
          trace({ uuid: "trace-2", message_id: null, input_preview: "Second" }),
        ]),
      );
      render(<TracesTabContent agentUuid="agent-1" />);

      await user.click(screen.getByLabelText("Select all traces"));
      await user.click(screen.getByText("Submit for labelling (2)"));

      expect(screen.getByTestId("labelling-evaluators-agent")).toHaveTextContent(
        "agent-1",
      );
      // Nothing is fetched until the evaluators are settled.
      expect(fetchTrace).not.toHaveBeenCalled();

      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("labelling-evaluators")).not.toBeInTheDocument();
      // One fetch per selected trace, because the rows only hold previews.
      expect(fetchTrace).toHaveBeenCalledTimes(2);
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-1");
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-2");

      expect(screen.getByTestId("labelling-source")).toHaveTextContent("traces");
      expect(screen.getByTestId("labelling-agent")).toHaveTextContent("agent-1");
      expect(screen.getByTestId("labelling-evaluator-uuids")).toHaveTextContent(
        "ev-1",
      );
      expect(
        JSON.parse(screen.getByTestId("labelling-payload").textContent!),
      ).toEqual([
        {
          name: "msg-001",
          input: [{ role: "user", content: "When is the next vaccination?" }],
          output: { response: "At 14 weeks.", tool_calls: null },
        },
        {
          // No message id, so the first thing the caller said names it.
          name: "When is the next vaccination?",
          input: [{ role: "user", content: "When is the next vaccination?" }],
          output: { response: "At 14 weeks.", tool_calls: null },
        },
      ]);
    });

    it("shows the traces are being loaded before the task dialog opens", async () => {
      const user = setupUser();
      fetchTrace.mockReturnValue(new Promise(() => {}));
      render(<TracesTabContent agentUuid="agent-1" />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      expect(screen.getByText("Loading traces...")).toBeInTheDocument();
      expect(screen.getByText("Loading traces...")).toBeDisabled();
      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
    });

    it("clears the selection once the traces are added to a task", async () => {
      const user = setupUser();
      render(<TracesTabContent agentUuid="agent-1" />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));
      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("finish labelling"));

      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Submit for labelling (1)"),
      ).not.toBeInTheDocument();
    });

    it("says so when the traces cannot be loaded, instead of opening an empty task", async () => {
      const user = setupUser();
      fetchTrace.mockRejectedValue(new Error("boom"));
      render(<TracesTabContent agentUuid="agent-1" />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "Could not load the selected traces. Please try again.",
        ),
      );
      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
      expect(reportError).toHaveBeenCalledWith(
        "Error loading traces for labelling:",
        expect.any(Error),
      );
      // The selection survives so the reader can try again.
      expect(screen.getByText("Submit for labelling (1)")).toBeInTheDocument();
    });
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
