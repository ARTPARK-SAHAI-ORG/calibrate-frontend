import { act, render, screen, waitFor, setupUser } from "@/test-utils";
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
  useTraceLabels: () => mockUseTraceLabels(),
  // Selection is real: the convert/delete buttons only appear once a row is
  // ticked, which the selection tests exercise.
  useTraceDeletion: jest.requireActual("../../../hooks/useTraceDeletion")
    .useTraceDeletion,
  useDialogUrlParam: (args: unknown) => mockUseDialogUrlParam(args),
  // Real, so the previous/next buttons on the detail dialog are exercised
  // end to end rather than stubbed away.
  useItemPager: jest.requireActual("../../../hooks/useItemPager").useItemPager,
  // The remembered page size is real, so choosing one is exercised end to end.
  usePageSize: jest.requireActual("../../../hooks/usePageSize").usePageSize,
  PAGE_SIZE_OPTIONS: jest.requireActual("../../../hooks/usePageSize")
    .PAGE_SIZE_OPTIONS,
}));

const fetchTrace = jest.fn();
const fetchTraces = jest.fn();
jest.mock("../../../lib/tracesApi", () => ({
  fetchTrace: (...args: unknown[]) => fetchTrace(...args),
  fetchTraces: (...args: unknown[]) => fetchTraces(...args),
  MAX_TRACES_PAGE_SIZE: 200,
}));

// The agent's own evaluators decide whether the attach prompt has anything to
// ask about, so they are driven from the test rather than the network.
const fetchAgentEvaluators = jest.fn(async () => [] as { uuid: string }[]);
const addEvaluatorsToAgent = jest.fn(async () => ({}));
jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: () => fetchAgentEvaluators(),
  fetchAllEvaluators: async () => [],
  addEvaluatorsToAgent: (...args: unknown[]) => addEvaluatorsToAgent(...args),
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
    onClose,
  }: {
    isOpen: boolean;
    source: {
      type: string;
      agentUuid: string;
      traces: { name: string; input: unknown[] | string; output: unknown }[];
      evaluators?: { uuid: string }[];
      agentNature?: string;
    };
    onAdded?: (taskUuid: string, itemsCreated: number) => void;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="labelling-task">
        <span data-testid="labelling-source">{source.type}</span>
        <span data-testid="labelling-agent">{source.agentUuid}</span>
        <span data-testid="labelling-nature">{source.agentNature}</span>
        <span data-testid="labelling-payload">
          {JSON.stringify(source.traces)}
        </span>
        <span data-testid="labelling-evaluator-uuids">
          {(source.evaluators ?? []).map((e) => e.uuid).join(",")}
        </span>
        <button type="button" onClick={() => onAdded?.("task-1", 1)}>
          finish labelling
        </button>
        <button type="button" onClick={onClose}>
          close labelling
        </button>
      </div>
    ) : null,
}));

// The stub exposes the check callback so a test can prove the tab wires its
// own refetch into the setup steps.
jest.mock("../../traces/TracesEmptyState", () => ({
  TracesEmptyState: ({
    onCheckForTraces,
  }: {
    onCheckForTraces: () => void;
  }) => (
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
    hasPrev,
    hasNext,
    onPrev,
    onNext,
    position,
    isSelected,
    onToggleSelected,
    selectedCount,
  }: {
    isOpen: boolean;
    traceUuid: string | null;
    hasPrev?: boolean;
    hasNext?: boolean;
    onPrev?: () => void;
    onNext?: () => void;
    position?: { index: number; total: number };
    isSelected?: boolean;
    onToggleSelected?: () => void;
    selectedCount?: number;
  }) =>
    isOpen ? (
      <div data-testid="trace-detail">
        {traceUuid}
        <button
          type="button"
          onClick={onToggleSelected}
          data-testid="trace-detail-toggle"
        >
          {isSelected ? "remove from selection" : "add to selection"}
        </button>
        <span data-testid="trace-detail-count">{selectedCount}</span>
        <span data-testid="trace-detail-position">
          {position ? `${position.index + 1} of ${position.total}` : ""}
        </span>
        <button
          type="button"
          disabled={!hasPrev}
          onClick={onPrev}
          data-testid="trace-detail-prev"
        >
          prev
        </button>
        <button
          type="button"
          disabled={!hasNext}
          onClick={onNext}
          data-testid="trace-detail-next"
        >
          next
        </button>
      </div>
    ) : null,
}));
// The stub also exposes onConverted, so the "created N tests" message the tab
// builds from the response is exercised rather than assumed.
jest.mock("../../traces/ConvertTracesToTestsDialog", () => ({
  ConvertTracesToTestsDialog: ({
    isOpen,
    agentUuid,
    traceUuids,
    testType,
    selectAll,
    agentNature,
    onConverted,
  }: {
    isOpen: boolean;
    agentUuid: string;
    traceUuids: string[];
    testType: "response" | "tool_call" | "general";
    selectAll?: {
      agentId: string;
      outputType?: string;
      labels?: string[];
    } | null;
    agentNature?: string;
    onConverted: (
      result: { created: number; test_uuids: string[] },
      evaluatorsUsed?: { uuid: string; name: string }[],
    ) => void;
  }) =>
    isOpen ? (
      <div data-testid="convert-dialog">
        <span data-testid="convert-agent">{agentUuid}</span>
        <span data-testid="convert-traces">{traceUuids.join(",")}</span>
        <span data-testid="convert-type">{testType}</span>
        <span data-testid="convert-select-all">
          {selectAll
            ? `${selectAll.agentId}|${selectAll.outputType}|${(
                selectAll.labels ?? []
              ).join(",")}`
            : "none"}
        </span>
        <span data-testid="convert-nature">{agentNature}</span>
        <button
          type="button"
          onClick={() => onConverted({ created: 2, test_uuids: ["t1", "t2"] })}
        >
          finish adding
        </button>
        <button
          type="button"
          onClick={() =>
            onConverted({ created: 1, test_uuids: ["t1"] }, [
              { uuid: "ev-9", name: "Tone check" },
            ])
          }
        >
          finish adding with a new evaluator
        </button>
      </div>
    ) : null,
}));

// The labels the agent's traces carry, which the filter offers. Most tests
// have none, so the picker stays out of the way.
const refetchLabels = jest.fn();
const mockUseTraceLabels = jest.fn(() => ({
  labels: [] as string[],
  refetch: refetchLabels,
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

function tracesResult(
  items: TraceSummary[],
  over: Record<string, unknown> = {},
) {
  return {
    items,
    total: items.length,
    loadedQ: "",
    loadedOutputType: "all",
    loadedLabels: [],
    offset: 0,
    setOffset: jest.fn(),
    loadedOffset: 0,
    isLoading: false,
    error: null,
    handleDeleted,
    refetch,
    hasPrev: false,
    hasNext: false,
    prevPage: jest.fn(),
    nextPage: jest.fn(),
    ...over,
  };
}

// The tab is only ever rendered by the agent detail page, which passes both
// callbacks: one to reload the Tests tab, one to open it.
const onTestsCreated = jest.fn();
const onViewTests = jest.fn();
const tabProps = { agentUuid: "agent-1", onTestsCreated, onViewTests };

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  mockUseTraces.mockReturnValue(tracesResult([trace()]));
  mockUseTraceLabels.mockReturnValue({ labels: [], refetch: refetchLabels });
  fetchAgentEvaluators.mockResolvedValue([]);
});

/** The last arguments `useTraces` was called with, i.e. what is on screen now. */
function lastTracesArgs() {
  return mockUseTraces.mock.calls[mockUseTraces.mock.calls.length - 1][0];
}

describe("TracesTabContent", () => {
  it("refreshes the trace list when asked", async () => {
    refetch.mockResolvedValue(false);
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("reads the labels again when the list is refreshed", async () => {
    refetch.mockResolvedValue(false);
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    // A trace that has just landed can carry a label nothing has seen yet.
    expect(refetchLabels).toHaveBeenCalledTimes(1);
  });

  it("reads the labels again when the setup steps look for the first trace", async () => {
    refetch.mockResolvedValue(false);
    mockUseTraces.mockReturnValue(tracesResult([]));
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByText("check"));

    expect(refetchLabels).toHaveBeenCalledTimes(1);
  });

  it("keeps the sending code reachable once traces exist", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    // The setup steps are gone at this point, so this is the only way back to
    // the request: no selection needed.
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View code" }));

    expect(
      screen.getByRole("heading", { name: "Send your first trace" }),
    ).toBeInTheDocument();
    expect(document.querySelector("pre")?.textContent).toContain(
      '"agent_id": "agent-1"',
    );
  });

  it("shows the input as one piece of text for a general agent", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} agentNature="general" />);

    await user.click(screen.getByRole("button", { name: "View code" }));

    const snippet = document.querySelector("pre")?.textContent ?? "";
    expect(snippet).toContain('"input": "When is the next vaccination?"');
    expect(snippet).not.toContain('"role"');
  });

  it("lists the loaded traces for this agent", () => {
    render(<TracesTabContent {...tabProps} />);

    expect(screen.queryByText("msg-001")).not.toBeInTheDocument();
    expect(
      screen.getAllByText("When is the next vaccination?").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("1 trace")).toBeInTheDocument();
    expect(screen.queryByText(/Showing/)).not.toBeInTheDocument();
    expect(mockUseTraces).toHaveBeenCalledWith(
      expect.objectContaining({ agentId: "agent-1" }),
    );
    // Nothing typed yet, so the whole list is asked for.
    expect(lastTracesArgs().q).toBe("");
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
    render(<TracesTabContent {...tabProps} />);
    expect(screen.queryByLabelText("Per page")).not.toBeInTheDocument();
  });

  it("lets the reader change how many traces a page holds", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue({
      ...tracesResult([trace()]),
      total: 11,
      hasNext: true,
    });

    render(<TracesTabContent {...tabProps} />);

    await user.selectOptions(screen.getByLabelText("Per page"), "25");
    await waitFor(() => expect(lastTracesArgs().pageSize).toBe(25));
    expect(window.localStorage.getItem("calibrate:items-page-size")).toBe("25");
  });

  it("shows the count above the rows with page navigation", async () => {
    const user = setupUser();
    const nextPage = jest.fn();
    window.localStorage.setItem("calibrate:items-page-size", "10");
    mockUseTraces.mockReturnValue({
      ...tracesResult([trace()]),
      total: 25,
      offset: 0,
      hasNext: true,
      nextPage,
    });

    render(<TracesTabContent {...tabProps} />);

    const nextButton = screen.getByRole("button", { name: "Next page" });

    expect(screen.getByText(/Showing/)).toBeInTheDocument();
    expect(
      nextButton.compareDocumentPosition(screen.getByText("Input")) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    await user.click(nextButton);
    expect(nextPage).toHaveBeenCalledTimes(1);
  });

  it("searches on the backend once typing pauses", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    expect(lastTracesArgs().q).toBe("");
    await user.type(screen.getByPlaceholderText("Search traces"), "polio");

    await waitFor(() => expect(lastTracesArgs().q).toBe("polio"));
  });

  it("asks the backend for one kind of output when a filter is chosen", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    expect(lastTracesArgs().outputType).toBe("all");
    await user.click(screen.getByRole("button", { name: "Tool call" }));

    await waitFor(() => expect(lastTracesArgs().outputType).toBe("tool_call"));
  });

  it("filters by the labels the reader picks", async () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production", "staging"],
      refetch: refetchLabels,
    });
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    expect(lastTracesArgs().labels).toEqual([]);
    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));

    await waitFor(() =>
      expect(lastTracesArgs().labels).toEqual(["production"]),
    );
  });

  it("takes the picked labels into a whole matching list, and counts within them", async () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production", "staging"],
      refetch: refetchLabels,
    });
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    // Only replies in the labelled list, so the whole list is one kind.
    fetchTraces.mockImplementation(
      async (
        _token: string,
        params: {
          outputType: string;
        },
      ) => ({
        items: [],
        total: params.outputType === "response" ? 4 : 0,
        limit: 1,
        offset: 0,
      }),
    );
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));
    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Add to tests (4)"));

    expect(await screen.findByTestId("convert-dialog")).toBeInTheDocument();
    // The backend re-reads the list from these filters, so the label has to
    // be among them or it acts on traces the reader never saw.
    expect(screen.getByTestId("convert-select-all")).toHaveTextContent(
      "agent-1|response|production",
    );
    // The counts that decided the kind were read within the label too.
    expect(fetchTraces).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({ labels: ["production"] }),
    );
  });

  it("drops the ticked traces when a label is picked", async () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production"],
      refetch: refetchLabels,
    });
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    expect(screen.getByText("trace selected")).toBeInTheDocument();

    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));

    // The tick was made against the old list, so acting on it would reach
    // traces the new one does not hold.
    expect(screen.queryByText("trace selected")).not.toBeInTheDocument();
  });

  it("keeps the setup steps away the moment a label is picked", async () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production"],
      refetch: refetchLabels,
    });
    // Nothing carries the label, and the rows for it have not arrived yet, so
    // `loadedLabels` is still empty: exactly the moment after the pick.
    mockUseTraces.mockImplementation((args: { labels: string[] }) =>
      args.labels.length > 0
        ? tracesResult([], { total: 0 })
        : tracesResult([trace({ uuid: "trace-1" })]),
    );
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));

    expect(screen.getByText("No traces match your filter")).toBeInTheDocument();
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("does not open the add-to-tests window on a list the reader has left", async () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production"],
      refetch: refetchLabels,
    });
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    // The counts are still in flight while the reader changes the filter.
    // Replies only, so without the guard the answer is a usable kind and the
    // window opens on the list the reader has already left.
    const answers: Array<(kind: { total: number }) => void> = [];
    fetchTraces.mockImplementation(
      (_token: string, params: { outputType: string }) =>
        new Promise((resolve) => {
          answers.push(() =>
            resolve({
              items: [],
              total: params.outputType === "response" ? 4 : 0,
              limit: 1,
              offset: 0,
            }),
          );
        }),
    );
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Add to tests (4)"));
    await user.click(screen.getByText("All labels"));
    await user.click(screen.getByText("production"));
    await act(async () => {
      answers.forEach((answer) => answer());
    });

    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
  });

  it("leaves the label filter out when the traces carry no labels", () => {
    render(<TracesTabContent {...tabProps} />);

    expect(screen.queryByText("All labels")).not.toBeInTheDocument();
  });

  it("says nothing matched instead of the setup steps when a label is picked", () => {
    mockUseTraceLabels.mockReturnValue({
      labels: ["production"],
      refetch: refetchLabels,
    });
    mockUseTraces.mockReturnValue(
      tracesResult([], { loadedLabels: ["production"] }),
    );
    render(<TracesTabContent {...tabProps} />);

    expect(screen.getByText("No traces match your filter")).toBeInTheDocument();
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("select all ticks the filtered traces and nothing else", async () => {
    const user = setupUser();
    // Filtering happens on the backend, so the page holds only the traces that
    // matched: ticking select all can never reach the ones it hid.
    mockUseTraces.mockReturnValue(
      tracesResult(
        [
          trace({
            uuid: "trace-tool",
            response_preview: null,
            tool_call_count: 1,
          }),
        ],
        { loadedOutputType: "tool_call", total: 1 },
      ),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("trace selected")).toBeInTheDocument();
  });

  it("counts every trace the list matches once the whole list is asked for", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" }), trace({ uuid: "trace-2" })], {
        total: 5,
        hasNext: true,
      }),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByText("Select all 5 traces"));

    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Delete selected (5)")).toBeInTheDocument();
    // The whole list is spoken for, so there is nothing left to offer.
    expect(screen.queryByText("Select all 5 traces")).not.toBeInTheDocument();
  });

  it("refuses a whole list holding both kinds, in the same words as a mixed tick", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    // Both kinds are in the list the filters match.
    fetchTraces.mockResolvedValue({ items: [], total: 2, limit: 1, offset: 0 });
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Add to tests (4)"));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The selected traces contains a mix of responses and tool calls. Select all traces having the same type of output at a time to add them as a group.",
      ),
    );
    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
  });

  it("adds a whole list of one kind without asking anything", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    // Only tool-call traces match, so there is nothing to ask about.
    fetchTraces.mockImplementation(
      async (_token: string, params: { outputType?: string }) => ({
        items: [],
        total: params.outputType === "tool_call" ? 4 : 0,
        limit: 1,
        offset: 0,
      }),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Add to tests (4)"));

    expect(await screen.findByTestId("convert-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("convert-type")).toHaveTextContent("tool_call");
    // The kind is pinned on the filters, so the backend reads only that kind.
    expect(screen.getByTestId("convert-select-all")).toHaveTextContent(
      "agent-1|tool_call",
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("adds a general agent's whole list as general tests", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    render(<TracesTabContent {...tabProps} agentNature="general" />);

    // The list itself is filtered to replies, so no counting is needed.
    await user.click(screen.getByRole("button", { name: "Response" }));
    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Add to tests (4)"));

    expect(await screen.findByTestId("convert-type")).toHaveTextContent(
      "general",
    );
    expect(fetchTraces).not.toHaveBeenCalled();
  });

  it("keeps labelling to the ticked traces when the whole list is asked for", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Submit for labelling"));

    expect(toast.error).toHaveBeenCalledWith(
      "Labelling works on the traces you tick. Untick the whole list and pick the ones to send.",
    );
    expect(
      screen.queryByTestId("labelling-evaluators"),
    ).not.toBeInTheDocument();
  });

  it("says how many will really go when the whole list is asked for", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" })], { total: 4, hasNext: true }),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 4 traces"));
    await user.click(screen.getByText("Delete selected (4)"));

    expect(screen.getByText("Delete 4 traces?")).toBeInTheDocument();
  });

  it("drops the whole-list choice when a row is unticked", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([trace({ uuid: "trace-1" }), trace({ uuid: "trace-2" })], {
        total: 6,
        hasNext: true,
      }),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Select all 6 traces"));
    expect(screen.getByText("6")).toBeInTheDocument();

    // Taking one row out is the reader narrowing what they want.
    await user.click(screen.getAllByLabelText("Select trace")[0]);

    expect(screen.getByText("1")).toBeInTheDocument();
    expect(screen.getByText("Delete selected (1)")).toBeInTheDocument();
  });

  it("does not offer to tick every trace when they all fit on one page", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));

    expect(screen.queryByText(/^Select all \d+ trace/)).not.toBeInTheDocument();
  });

  it("says nothing matched the filter instead of showing the setup steps", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    mockUseTraces.mockReturnValue(
      tracesResult([], { loadedOutputType: "tool_call" }),
    );
    await user.click(screen.getByRole("button", { name: "Tool call" }));

    await waitFor(() =>
      expect(
        screen.getByText("No traces match your filter"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("names both when a search and a filter are on together", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    mockUseTraces.mockReturnValue(
      tracesResult([], { loadedQ: "polio", loadedOutputType: "tool_call" }),
    );
    await user.click(screen.getByRole("button", { name: "Tool call" }));
    await user.type(screen.getByPlaceholderText("Search traces"), "polio");

    await waitFor(() =>
      expect(
        screen.getByText("No traces match your search and filter"),
      ).toBeInTheDocument(),
    );
  });

  it("keeps the setup steps away while a cleared filter loads the full list back", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    mockUseTraces.mockReturnValue(
      tracesResult([], { loadedOutputType: "tool_call" }),
    );
    await user.click(screen.getByRole("button", { name: "Tool call" }));
    await waitFor(() =>
      expect(
        screen.getByText("No traces match your filter"),
      ).toBeInTheDocument(),
    );

    // Back to All. The rows on screen are still the filtered ones until the
    // full list has loaded, so the setup steps must not appear in between.
    await user.click(screen.getByRole("button", { name: "All" }));

    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("says nothing matched instead of showing the setup steps", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    mockUseTraces.mockReturnValue(tracesResult([], { loadedQ: "polio" }));
    await user.type(screen.getByPlaceholderText("Search traces"), "polio");

    await waitFor(() =>
      expect(
        screen.getByText("No traces match your search"),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
    // The search box has to stay, or there is no way back to the full list.
    expect(screen.getByPlaceholderText("Search traces")).toBeInTheDocument();
  });

  it("keeps the setup steps away while a cleared search loads the full list back", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    // The search found nothing, so the rows on screen belong to "polio".
    mockUseTraces.mockReturnValue(tracesResult([], { loadedQ: "polio" }));
    const box = screen.getByPlaceholderText("Search traces");
    await user.type(box, "polio");
    await waitFor(() =>
      expect(
        screen.getByText("No traces match your search"),
      ).toBeInTheDocument(),
    );

    // The box is cleared, but the full list has not come back yet.
    await user.clear(box);
    await waitFor(() => expect(lastTracesArgs().q).toBe(""));

    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("keeps the wait on screen when a search empties the list mid-load", async () => {
    const user = setupUser();
    fetchTrace.mockReturnValue(new Promise(() => {}));
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Submit for labelling (1)"));
    await user.click(screen.getByText("choose evaluators"));
    expect(screen.getByText("Loading traces...")).toBeInTheDocument();

    // A search lands while the traces are still loading and matches nothing.
    mockUseTraces.mockReturnValue(tracesResult([], { loadedQ: "polio" }));
    await user.type(screen.getByPlaceholderText("Search traces"), "polio");

    await waitFor(() =>
      expect(
        screen.getByText("No traces match your search"),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText("Loading traces...")).toBeInTheDocument();
  });

  it("does not blame a failed load on the search", () => {
    mockUseTraces.mockReturnValue(
      tracesResult([], { error: "Failed to load traces. Please try again." }),
    );

    render(<TracesTabContent {...tabProps} />);

    expect(
      screen.getByText("Failed to load traces. Please try again."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No traces match your search"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when the agent has no traces", () => {
    mockUseTraces.mockReturnValue(tracesResult([]));

    render(<TracesTabContent {...tabProps} />);

    expect(screen.getByTestId("traces-empty-state")).toBeInTheDocument();
    expect(screen.queryByText("1 trace")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "View code" }),
    ).not.toBeInTheDocument();
  });

  it("gives the setup steps a way to look for traces again", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(tracesResult([]));
    render(<TracesTabContent {...tabProps} />);

    // Nothing happens until the reader asks: no timers, no background checks.
    expect(refetch).not.toHaveBeenCalled();

    await user.click(screen.getByText("check"));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps the setup steps on screen while it checks for traces again", async () => {
    const user = setupUser();
    let loading = false;
    mockUseTraces.mockImplementation(() => ({
      ...tracesResult([]),
      isLoading: loading,
    }));
    const { container, rerender } = render(<TracesTabContent {...tabProps} />);

    expect(screen.getByTestId("traces-empty-state")).toBeInTheDocument();

    await user.click(screen.getByText("check"));
    // The check is running now.
    loading = true;
    rerender(<TracesTabContent {...tabProps} />);

    // The steps, and everything the reader filled in on them, are still there.
    expect(screen.getByTestId("traces-empty-state")).toBeInTheDocument();
    expect(container.querySelector("svg.animate-spin")).not.toBeInTheDocument();
  });

  it("keeps the setup steps on screen when the check fails", async () => {
    const user = setupUser();
    let failed = false;
    mockUseTraces.mockImplementation(() => ({
      ...tracesResult([]),
      error: failed ? "Failed to load traces. Please try again." : null,
    }));
    const { rerender } = render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByText("check"));
    failed = true;
    rerender(<TracesTabContent {...tabProps} />);

    // The API key the reader just made lives only on this screen and is shown
    // once, so a failed check must not take it away.
    expect(screen.getByTestId("traces-empty-state")).toBeInTheDocument();
    expect(
      screen.getByText("Failed to load traces. Please try again."),
    ).toBeInTheDocument();
  });

  it("shows the spinner on the first load only", () => {
    mockUseTraces.mockReturnValue({ ...tracesResult([]), isLoading: true });
    const { container } = render(<TracesTabContent {...tabProps} />);

    expect(container.querySelector("svg.animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("traces-empty-state")).not.toBeInTheDocument();
  });

  it("reveals the add and delete actions once a trace is selected", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    expect(screen.queryByText(/Add to tests/)).not.toBeInTheDocument();

    await user.click(screen.getAllByLabelText("Select trace")[0]);

    expect(screen.getByText("Add to tests (1)")).toBeInTheDocument();
    expect(screen.getByText("Delete selected (1)")).toBeInTheDocument();
  });

  it("warns that single and bulk deletion cannot be undone", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

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
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));
    await user.click(screen.getByText("finish adding"));

    // Two uuids came back, so the message says two. The ticks stay on, so the
    // same traces can be sent for labelling without picking them again.
    expect(toast.success).toHaveBeenCalledWith(
      "Created 2 tests",
      expect.anything(),
    );
    expect(screen.getByText("Add to tests (1)")).toBeInTheDocument();
  });

  it("offers to attach an evaluator the agent does not have after adding tests", async () => {
    const user = setupUser();
    const onAgentDefaultsAttached = jest.fn();
    render(
      <TracesTabContent
        {...tabProps}
        onAgentDefaultsAttached={onAgentDefaultsAttached}
      />,
    );

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));
    await user.click(screen.getByText("finish adding with a new evaluator"));

    expect(
      await screen.findByText("Attach this evaluator to the agent?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(
      screen.getByText(/The test you just added uses an evaluator/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Attach" }));

    await waitFor(() =>
      expect(addEvaluatorsToAgent).toHaveBeenCalledWith(
        "agent-1",
        ["ev-9"],
        "test-token",
      ),
    );
    expect(onAgentDefaultsAttached).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(
        screen.queryByText("Attach this evaluator to the agent?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("does not offer to attach an evaluator the agent already has", async () => {
    const user = setupUser();
    fetchAgentEvaluators.mockResolvedValue([{ uuid: "ev-9" }]);
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));
    await user.click(screen.getByText("finish adding with a new evaluator"));

    await waitFor(() => expect(fetchAgentEvaluators).toHaveBeenCalled());
    expect(
      screen.queryByText("Attach this evaluator to the agent?"),
    ).not.toBeInTheDocument();
  });

  it("reloads the Tests tab and sends View tests there", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));
    await user.click(screen.getByText("finish adding"));

    expect(onTestsCreated).toHaveBeenCalledTimes(1);
    const options = (toast.success as jest.Mock).mock.calls[0][1];
    expect(options.action.label).toBe("View tests");
    options.action.onClick();
    expect(onViewTests).toHaveBeenCalledTimes(1);
  });

  it("opens the add dialog with response type when a selected trace has a response", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));

    expect(screen.getByTestId("convert-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("convert-agent")).toHaveTextContent("agent-1");
    expect(screen.getByTestId("convert-traces")).toHaveTextContent("trace-1");
    expect(screen.getByTestId("convert-type")).toHaveTextContent("response");
  });

  it("adds a general agent's traces as general tests", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} agentNature="general" />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));

    expect(screen.getByTestId("convert-type")).toHaveTextContent("general");
    expect(screen.getByTestId("convert-nature")).toHaveTextContent("general");
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
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getByText("Add to tests (1)"));

    expect(screen.getByTestId("convert-type")).toHaveTextContent("tool_call");
  });

  it("refuses a selection mixing replies and tool calls", async () => {
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
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Add to tests (2)"));

    expect(toast.error).toHaveBeenCalledWith(
      "The selected traces contains a mix of responses and tool calls. Select all traces having the same type of output at a time to add them as a group.",
    );
    expect(screen.queryByTestId("convert-dialog")).not.toBeInTheDocument();
  });

  it("adds a selection that is all replies", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace(),
        trace({ uuid: "trace-2", message_id: "msg-002" }),
      ]),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getByLabelText("Select all traces"));
    await user.click(screen.getByText("Add to tests (2)"));

    expect(screen.getByTestId("convert-dialog")).toBeInTheDocument();
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
      render(<TracesTabContent {...tabProps} />);

      expect(
        screen.queryByText(/Submit for labelling/),
      ).not.toBeInTheDocument();

      await user.click(screen.getAllByLabelText("Select trace")[0]);

      expect(screen.getByText("Submit for labelling (1)")).toBeInTheDocument();
    });

    it("sends a general agent's trace as plain text, not as turns", async () => {
      const user = setupUser();
      fetchTrace.mockImplementation(async (_token: string, uuid: string) =>
        detail({ uuid, input: "When is the next vaccination?" }),
      );
      render(<TracesTabContent {...tabProps} agentNature="general" />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      const payload = await screen.findByTestId("labelling-payload");
      expect(JSON.parse(payload.textContent ?? "[]")[0].input).toBe(
        "When is the next vaccination?",
      );
      expect(screen.getByTestId("labelling-nature")).toHaveTextContent(
        "general",
      );
    });

    it("submits a tool-call-only selection straight to a tool-call task, skipping evaluators", async () => {
      const user = setupUser();
      mockUseTraces.mockReturnValue(
        tracesResult([trace({ response_preview: null, tool_call_count: 1 })]),
      );
      fetchTrace.mockImplementation(async (_token: string, uuid: string) =>
        detail({
          uuid,
          output: {
            response: null,
            tool_calls: [{ tool: "lookup", arguments: { q: "x" } }],
          },
        }),
      );
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));

      // No evaluator step for a tool-call task, and no error.
      expect(screen.queryByTestId("labelling-evaluators")).toBeNull();
      expect(toast.error).not.toHaveBeenCalled();
      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-1");
      // The tool call is carried through, and no evaluators are attached.
      expect(screen.getByTestId("labelling-payload")).toHaveTextContent(
        "lookup",
      );
      expect(
        screen.getByTestId("labelling-evaluator-uuids").textContent,
      ).toBe("");
    });

    it("leaves a tool-call-only trace out of a mixed selection", async () => {
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
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getByLabelText("Select all traces"));
      // Only the trace that replied is labellable here (the response flow);
      // the tool-call-only one is left out, so the count is 1.
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      // Only the reply trace is fetched and submitted.
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-1");
      expect(fetchTrace).not.toHaveBeenCalledWith("test-token", "trace-2");
    });

    it("labels a trace that both replied and called a tool as a response", async () => {
      const user = setupUser();
      mockUseTraces.mockReturnValue(
        tracesResult([trace({ tool_call_count: 1 })]),
      );
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      // It replied, so it is labellable as a response — not blocked.
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("asks for evaluators, then hands the full traces to the task dialog", async () => {
      const user = setupUser();
      mockUseTraces.mockReturnValue(
        tracesResult([
          trace(),
          trace({ uuid: "trace-2", message_id: null, input_preview: "Second" }),
        ]),
      );
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getByLabelText("Select all traces"));
      await user.click(screen.getByText("Submit for labelling (2)"));

      expect(
        screen.getByTestId("labelling-evaluators-agent"),
      ).toHaveTextContent("agent-1");
      // Nothing is fetched until the evaluators are settled.
      expect(fetchTrace).not.toHaveBeenCalled();

      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      expect(
        screen.queryByTestId("labelling-evaluators"),
      ).not.toBeInTheDocument();
      // One fetch per selected trace, because the rows only hold previews.
      expect(fetchTrace).toHaveBeenCalledTimes(2);
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-1");
      expect(fetchTrace).toHaveBeenCalledWith("test-token", "trace-2");

      expect(screen.getByTestId("labelling-source")).toHaveTextContent(
        "traces",
      );
      expect(screen.getByTestId("labelling-agent")).toHaveTextContent(
        "agent-1",
      );
      expect(screen.getByTestId("labelling-evaluator-uuids")).toHaveTextContent(
        "ev-1",
      );
      expect(
        JSON.parse(screen.getByTestId("labelling-payload").textContent!),
      ).toEqual([
        // Every trace is named by its own id, so two calls that open with the
        // same line cannot collide and lose the whole submission.
        {
          name: "trace-1",
          input: [{ role: "user", content: "When is the next vaccination?" }],
          output: { response: "At 14 weeks.", tool_calls: null },
        },
        {
          name: "trace-2",
          input: [{ role: "user", content: "When is the next vaccination?" }],
          output: { response: "At 14 weeks.", tool_calls: null },
        },
      ]);
    });

    it("shows the traces are being loaded before the task dialog opens", async () => {
      const user = setupUser();
      fetchTrace.mockReturnValue(new Promise(() => {}));
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      expect(screen.getByText("Loading traces...")).toBeInTheDocument();
      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
    });

    it("keeps the selection and leaves the task dialog open on its confirmation", async () => {
      const user = setupUser();
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));
      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("finish labelling"));

      // The dialog keeps showing its own confirmation, which is where the
      // reader opens the task or closes it.
      expect(screen.getByTestId("labelling-task")).toBeInTheDocument();
      // The same traces are often wanted as tests too, so nothing is unticked.
      expect(screen.getByText("Submit for labelling (1)")).toBeInTheDocument();

      await user.click(screen.getByText("close labelling"));
      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
    });

    it("offers to attach the labelling evaluators the agent does not have", async () => {
      const user = setupUser();
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));
      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );

      await user.click(screen.getByText("finish labelling"));

      expect(
        await screen.findByText("Attach this evaluator to the agent?"),
      ).toBeInTheDocument();
      expect(
        screen.getByText(/The traces you just sent for labelling/),
      ).toBeInTheDocument();
      expect(screen.getByText("Correctness")).toBeInTheDocument();

      // Skipping leaves the agent alone and the task dialog on screen.
      await user.click(screen.getByRole("button", { name: "Not now" }));
      expect(addEvaluatorsToAgent).not.toHaveBeenCalled();
      expect(screen.getByTestId("labelling-task")).toBeInTheDocument();
    });

    it("leaves the agent's own instructions out of what is stored", async () => {
      const user = setupUser();
      fetchTrace.mockResolvedValue(
        detail({
          input: [
            { role: "system", content: "You are a helpful health worker." },
            { role: "user", content: "When is the next vaccination?" },
          ],
        }),
      );
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      expect(
        JSON.parse(screen.getByTestId("labelling-payload").textContent!),
      ).toEqual([
        {
          name: "trace-1",
          input: [{ role: "user", content: "When is the next vaccination?" }],
          output: { response: "At 14 weeks.", tool_calls: null },
        },
      ]);
    });

    it("carries on with the traces that loaded and says how many were left out", async () => {
      const user = setupUser();
      mockUseTraces.mockReturnValue(
        tracesResult([
          trace(),
          trace({
            uuid: "trace-2",
            message_id: "msg-002",
            input_preview: "Second",
          }),
        ]),
      );
      fetchTrace.mockImplementation(async (_token: string, uuid: string) => {
        if (uuid === "trace-2") throw new Error("boom");
        return detail({ uuid });
      });
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getByLabelText("Select all traces"));
      await user.click(screen.getByText("Submit for labelling (2)"));
      await user.click(screen.getByText("choose evaluators"));

      await waitFor(() =>
        expect(screen.getByTestId("labelling-task")).toBeInTheDocument(),
      );
      // The one that loaded still goes to the task.
      expect(
        JSON.parse(screen.getByTestId("labelling-payload").textContent!),
      ).toHaveLength(1);
      expect(toast.error).toHaveBeenCalledWith(
        "1 trace could not be loaded and was left out.",
      );
      expect(reportError).toHaveBeenCalledWith(
        "Error loading traces for labelling:",
        expect.any(Error),
      );
    });

    it("keeps the wait on screen and does not open the task if the ticks change", async () => {
      const user = setupUser();
      let resolveTrace: (value: unknown) => void = () => {};
      fetchTrace.mockReturnValue(
        new Promise((resolve) => {
          resolveTrace = resolve;
        }),
      );
      render(<TracesTabContent {...tabProps} />);

      await user.click(screen.getAllByLabelText("Select trace")[0]);
      await user.click(screen.getByText("Submit for labelling (1)"));
      await user.click(screen.getByText("choose evaluators"));
      expect(screen.getByText("Loading traces...")).toBeInTheDocument();

      // The reader unticks the row while the trace is still loading.
      await user.click(screen.getAllByLabelText("Select trace")[0]);
      expect(screen.getByText("Loading traces...")).toBeInTheDocument();

      await act(async () => {
        resolveTrace(detail());
      });

      expect(screen.queryByTestId("labelling-task")).not.toBeInTheDocument();
      expect(screen.queryByText("Loading traces...")).not.toBeInTheDocument();
      // And it says why, instead of the wait quietly disappearing.
      expect(toast.error).toHaveBeenCalledWith(
        "The selected traces changed while they were loading, so nothing was submitted. Try again.",
      );
    });

    it("says so when the traces cannot be loaded, instead of opening an empty task", async () => {
      const user = setupUser();
      fetchTrace.mockRejectedValue(new Error("boom"));
      render(<TracesTabContent {...tabProps} />);

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
        trace({
          uuid: "trace-2",
          message_id: "msg-002",
          input_preview: "Second",
        }),
      ]),
    );
    render(<TracesTabContent {...tabProps} />);

    expect(screen.queryByTestId("trace-detail")).not.toBeInTheDocument();

    await user.click(screen.getAllByText("Second")[0]);

    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");
  });

  it("keeps the ticks when the reader moves to another page", async () => {
    const user = setupUser();
    const page1 = [
      trace(),
      trace({
        uuid: "trace-2",
        message_id: "msg-002",
        input_preview: "Second",
      }),
    ];
    mockUseTraces.mockReturnValue(tracesResult(page1, { total: 4 }));
    const { rerender } = render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    await user.click(screen.getAllByLabelText("Select trace")[1]);
    expect(screen.getByText("Add to tests (2)")).toBeInTheDocument();

    // Page two lands. The two traces ticked on page one are no longer on
    // screen, so this is exactly where the ticks used to disappear.
    mockUseTraces.mockReturnValue(
      tracesResult(
        [
          trace({
            uuid: "trace-3",
            message_id: "msg-003",
            input_preview: "Third",
          }),
        ],
        { total: 4, offset: 2, loadedOffset: 2 },
      ),
    );
    rerender(<TracesTabContent {...tabProps} />);

    expect(screen.getByText("Add to tests (2)")).toBeInTheDocument();
    await user.click(screen.getAllByLabelText("Select trace")[0]);
    expect(screen.getByText("Add to tests (3)")).toBeInTheDocument();
    // The one on page two replied, so the whole set still goes for labelling.
    expect(screen.getByText("Submit for labelling (3)")).toBeInTheDocument();
  });

  it("drops the ticks when the list is searched, since they cannot be seen", async () => {
    const user = setupUser();
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByLabelText("Select trace")[0]);
    expect(screen.getByText("Add to tests (1)")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search traces"), "polio");

    await waitFor(() =>
      expect(screen.queryByText("Add to tests (1)")).not.toBeInTheDocument(),
    );
  });

  it("ticks and unticks the open trace from inside its window", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace(),
        trace({
          uuid: "trace-2",
          message_id: "msg-002",
          input_preview: "Second",
        }),
      ]),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByText("Second")[0]);
    await user.click(screen.getByTestId("trace-detail-toggle"));

    // Ticked without leaving the trace, so the bulk actions are ready for it,
    // and the running count is on the window itself.
    expect(screen.getByText("Add to tests (1)")).toBeInTheDocument();
    expect(screen.getByTestId("trace-detail-count")).toHaveTextContent("1");
    expect(screen.getByTestId("trace-detail-toggle")).toHaveTextContent(
      "remove from selection",
    );

    await user.click(screen.getByTestId("trace-detail-toggle"));
    expect(screen.queryByText("Add to tests (1)")).not.toBeInTheDocument();
  });

  it("steps to the next and previous trace within the loaded page", async () => {
    const user = setupUser();
    mockUseTraces.mockReturnValue(
      tracesResult([
        trace(),
        trace({
          uuid: "trace-2",
          message_id: "msg-002",
          input_preview: "Second",
        }),
      ]),
    );
    render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByText("Second")[0]);
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");
    expect(screen.getByTestId("trace-detail-position")).toHaveTextContent(
      "2 of 2",
    );
    expect(screen.getByTestId("trace-detail-next")).toBeDisabled();

    await user.click(screen.getByTestId("trace-detail-prev"));
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-1");
    expect(screen.getByTestId("trace-detail-position")).toHaveTextContent(
      "1 of 2",
    );
    expect(screen.getByTestId("trace-detail-prev")).toBeDisabled();

    await user.click(screen.getByTestId("trace-detail-next"));
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");
  });

  it("waits for the next page to actually load before opening its first trace", async () => {
    const user = setupUser();
    const setOffset = jest.fn();
    const page1 = [
      trace(),
      trace({
        uuid: "trace-2",
        message_id: "msg-002",
        input_preview: "Second",
      }),
    ];
    mockUseTraces.mockReturnValue(
      tracesResult(page1, {
        total: 4,
        offset: 0,
        loadedOffset: 0,
        hasNext: true,
        setOffset,
      }),
    );
    const { rerender } = render(<TracesTabContent {...tabProps} />);

    await user.click(screen.getAllByText("Second")[0]);
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");
    expect(screen.getByTestId("trace-detail-position")).toHaveTextContent(
      "2 of 4",
    );

    // Step past the last trace of the loaded page. The request for page two
    // has gone out (`setOffset` was called) but hasn't come back yet, so the
    // rows on screen are still page one's.
    await user.click(screen.getByTestId("trace-detail-next"));
    expect(setOffset).toHaveBeenCalledWith(50);

    // Simulate the state a moment after that click: the requested offset has
    // moved, but the trace rows have not arrived yet — same shape `useTraces`
    // is in mid-fetch. The dialog must not jump to a trace off page one
    // (the bug this guards: opening an old-page trace while page two loads).
    mockUseTraces.mockReturnValue(
      tracesResult(page1, {
        total: 4,
        offset: 50,
        loadedOffset: 0,
        hasNext: true,
        setOffset,
      }),
    );
    rerender(<TracesTabContent {...tabProps} />);
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-2");

    // Page two lands: `loadedOffset` catches up to match the new rows. Only
    // now should the dialog step onto the new page, opening its first trace.
    const page2 = [
      trace({ uuid: "trace-3", message_id: "msg-003", input_preview: "Third" }),
      trace({
        uuid: "trace-4",
        message_id: "msg-004",
        input_preview: "Fourth",
      }),
    ];
    mockUseTraces.mockReturnValue(
      tracesResult(page2, {
        total: 4,
        offset: 50,
        loadedOffset: 50,
        hasPrev: true,
        hasNext: false,
        setOffset,
      }),
    );
    rerender(<TracesTabContent {...tabProps} />);
    expect(screen.getByTestId("trace-detail")).toHaveTextContent("trace-3");
  });
});
