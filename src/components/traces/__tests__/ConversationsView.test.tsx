import { render, screen, waitFor, setupUser } from "@/test-utils";
import { ConversationsView } from "../ConversationsView";
import type { TraceConversation } from "@/lib/tracesApi";

const mockSetParam = jest.fn();
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useDialogUrlParam: () => ({ setParam: mockSetParam }),
  useItemPager: jest.requireActual("../../../hooks/useItemPager").useItemPager,
  usePageSize: jest.requireActual("../../../hooks/usePageSize").usePageSize,
  PAGE_SIZE_OPTIONS: jest.requireActual("../../../hooks/usePageSize")
    .PAGE_SIZE_OPTIONS,
}));

const fetchTraceConversations = jest.fn();
jest.mock("../../../lib/tracesApi", () => ({
  ...jest.requireActual("../../../lib/tracesApi"),
  fetchTraceConversations: (...args: unknown[]) =>
    fetchTraceConversations(...args),
}));

const reportError = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

// The window is tested on its own; here it only shows what it was handed.
jest.mock("../TraceDetailDialog", () => ({
  TraceDetailDialog: ({
    isOpen,
    conversation,
    onNext,
    hasNext,
    onClose,
  }: {
    isOpen: boolean;
    conversation: TraceConversation | null;
    onNext?: () => void;
    hasNext?: boolean;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="conversation-window">
        {conversation?.conversation_id}
        <button type="button" onClick={onClose}>
          close conversation
        </button>
        {hasNext && (
          <button type="button" onClick={onNext}>
            next conversation
          </button>
        )}
      </div>
    ) : null,
}));

function conversation(id: string, turns = 2): TraceConversation {
  return {
    conversation_id: id,
    agent_id: "agent-1",
    first_turn_at: "2026-01-01T10:00:00Z",
    last_turn_at: "2026-01-01T10:05:00Z",
    first_message_preview: `question in ${id}`,
    last_turn: {
      uuid: `trace-${id}`,
      agent_id: "agent-1",
      message_id: null,
      conversation_id: id,
      input_preview: `question in ${id}`,
      response_preview: `answer in ${id}`,
      turn_count: turns,
      tool_call_count: 0,
      metadata_count: 0,
      created_at: "2026-01-01T10:05:00Z",
    },
  };
}

const onFilterChange = jest.fn();
const props = {
  agentUuid: "agent-1",
  outputType: "all" as const,
  labels: [] as string[],
  allLabels: [] as string[],
  onFilterChange,
};

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  fetchTraceConversations.mockResolvedValue({
    items: [conversation("conv-a"), conversation("conv-b", 1)],
    total: 2,
    limit: 10,
    offset: 0,
  });
});

describe("ConversationsView", () => {
  it("lists the agent's conversations", async () => {
    render(<ConversationsView {...props} labels={["vip"]} />);

    expect((await screen.findAllByText("conv-a")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("conv-b").length).toBeGreaterThan(0);
    expect(screen.getByText("2 conversations")).toBeInTheDocument();
    expect(fetchTraceConversations).toHaveBeenCalledWith(
      "test-token",
      expect.objectContaining({
        agentId: "agent-1",
        offset: 0,
        labels: ["vip"],
        outputType: "all",
      }),
    );
  });

  it("opens the whole conversation and steps to the next one", async () => {
    const user = setupUser();
    render(<ConversationsView {...props} />);

    await user.click((await screen.findAllByText("question in conv-a"))[0]);

    expect(screen.getByTestId("conversation-window")).toHaveTextContent(
      "conv-a",
    );
    expect(mockSetParam).toHaveBeenCalledWith("conv-a");

    await user.click(screen.getByRole("button", { name: "next conversation" }));
    expect(screen.getByTestId("conversation-window")).toHaveTextContent(
      "conv-b",
    );

    await user.click(screen.getByRole("button", { name: "close conversation" }));
    expect(screen.queryByTestId("conversation-window")).not.toBeInTheDocument();
    expect(mockSetParam).toHaveBeenLastCalledWith(null);
  });

  it("hands a picked filter back to the tab", async () => {
    const user = setupUser();
    render(<ConversationsView {...props} />);
    await screen.findAllByText("conv-a");

    await user.click(screen.getByRole("button", { name: "Filter traces" }));
    await user.click(screen.getByRole("button", { name: "Response" }));
    await user.click(screen.getByRole("button", { name: /^Apply/ }));

    expect(onFilterChange).toHaveBeenCalledWith({
      outputType: "response",
      labels: [],
    });
  });

  it("searches on the backend once typing pauses", async () => {
    const user = setupUser();
    render(<ConversationsView {...props} />);
    await screen.findAllByText("conv-a");

    await user.type(
      screen.getByPlaceholderText("Search conversations"),
      "refund",
    );

    await waitFor(() =>
      expect(fetchTraceConversations).toHaveBeenLastCalledWith(
        "test-token",
        expect.objectContaining({ q: "refund", offset: 0 }),
      ),
    );
  });

  describe("from a later page", () => {
    /** A long list with the reader already on its second page. */
    async function onSecondPage() {
      fetchTraceConversations.mockImplementation(
        async (_token: string, { offset }: { offset: number }) => ({
          items: [conversation(`conv-${offset}`)],
          total: 500,
          limit: 10,
          offset,
        }),
      );
      const user = setupUser();
      const view = render(<ConversationsView {...props} />);
      await screen.findAllByText("conv-0");
      await user.click(screen.getByRole("button", { name: /next page/i }));
      await screen.findAllByText("conv-50");
      return { user, ...view };
    }
    const expectFirstPage = (narrowed: Record<string, unknown>) =>
      waitFor(() =>
        expect(fetchTraceConversations).toHaveBeenLastCalledWith(
          "test-token",
          expect.objectContaining({ ...narrowed, offset: 0 }),
        ),
      );

    it("goes back to the first page on a new search", async () => {
      const { user } = await onSecondPage();
      await user.type(
        screen.getByPlaceholderText("Search conversations"),
        "refund",
      );
      await expectFirstPage({ q: "refund" });
    });

    it("goes back to the first page on a new output kind", async () => {
      const { rerender } = await onSecondPage();
      rerender(<ConversationsView {...props} outputType="response" />);
      await expectFirstPage({ outputType: "response" });
    });

    it("goes back to the first page on new labels", async () => {
      const { rerender } = await onSecondPage();
      rerender(<ConversationsView {...props} labels={["vip"]} />);
      await expectFirstPage({ labels: ["vip"] });
    });
  });

  it("says how to get conversations when there are none", async () => {
    fetchTraceConversations.mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
    render(<ConversationsView {...props} />);

    expect(
      await screen.findByText(
        "Send a conversation ID with each trace to see its conversation here",
      ),
    ).toBeInTheDocument();
  });

  it("says nothing matched when a filter is on", async () => {
    fetchTraceConversations.mockResolvedValue({
      items: [],
      total: 0,
      limit: 10,
      offset: 0,
    });
    render(<ConversationsView {...props} outputType="response" />);

    expect(
      await screen.findByText(
        "No conversations match your search and filters",
      ),
    ).toBeInTheDocument();
  });

  it("shows an error when the list cannot be loaded", async () => {
    fetchTraceConversations.mockRejectedValueOnce(new Error("boom"));
    const user = setupUser();
    render(<ConversationsView {...props} />);

    expect(
      await screen.findByText("Failed to load conversations"),
    ).toBeInTheDocument();
    expect(reportError).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect((await screen.findAllByText("conv-a")).length).toBeGreaterThan(0);
  });

  it("pages through the conversations", async () => {
    fetchTraceConversations.mockImplementation(
      async (_token: string, { offset }: { offset: number }) => ({
        items: [conversation(`conv-${offset}`)],
        total: 500,
        limit: 10,
        offset,
      }),
    );
    const user = setupUser();
    render(<ConversationsView {...props} />);
    await screen.findAllByText("conv-0");

    await user.click(screen.getByRole("button", { name: /next page/i }));

    await waitFor(() =>
      expect(fetchTraceConversations).toHaveBeenLastCalledWith(
        "test-token",
        expect.objectContaining({ offset: 50 }),
      ),
    );
    await user.click(await screen.findByRole("button", { name: /previous page/i }));
    await waitFor(() =>
      expect(fetchTraceConversations).toHaveBeenLastCalledWith(
        "test-token",
        expect.objectContaining({ offset: 0 }),
      ),
    );
  });
});
