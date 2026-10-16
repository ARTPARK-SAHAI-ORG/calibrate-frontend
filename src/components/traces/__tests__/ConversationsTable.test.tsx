import { render, screen, setupUser } from "@/test-utils";
import { ConversationsTable } from "../ConversationsTable";
import type { TraceConversation, TraceSummary } from "@/lib/tracesApi";

function conversation(
  id: string,
  lastTurn: Partial<TraceSummary> = {},
  overrides: Partial<TraceConversation> = {},
): TraceConversation {
  return {
    conversation_id: id,
    agent_id: "ag-1",
    trace_count: 4,
    first_turn_at: "2026-07-20T09:00:00Z",
    last_turn_at: "2026-07-20T10:00:00Z",
    first_message_preview: `First question in ${id}`,
    last_turn: {
      uuid: `t-${id}`,
      agent_id: "ag-1",
      message_id: null,
      conversation_id: id,
      input_preview: `Question in ${id}`,
      response_preview: `Answer in ${id}`,
      turn_count: 4,
      tool_call_count: 0,
      metadata_count: 0,
      created_at: "2026-07-20T10:00:00Z",
      ...lastTurn,
    },
    ...overrides,
  };
}

function renderTable(conversations: TraceConversation[]) {
  const onOpen = jest.fn();
  render(
    <ConversationsTable
      conversations={conversations}
      onOpen={onOpen}
      agentUuid="ag-1"
    />,
  );
  return { onOpen };
}

describe("ConversationsTable", () => {
  it("renders a row per conversation with its id and previews, and no count", () => {
    renderTable([
      conversation("conv-a"),
      conversation("conv-b", {}, { trace_count: 1 }),
    ]);
    expect(screen.getAllByText("conv-a").length).toBeGreaterThan(0);
    expect(screen.getAllByText("conv-b").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("First question in conv-a").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Question in conv-a")).not.toBeInTheDocument();
    expect(screen.getByText("First user message")).toBeInTheDocument();
    expect(screen.getByText("Last agent reply")).toBeInTheDocument();
    expect(screen.getByText("Answer in conv-a")).toBeInTheDocument();
    expect(screen.queryByText("Turns")).not.toBeInTheDocument();
    expect(screen.queryByText("4")).not.toBeInTheDocument();
    expect(screen.queryByText(/turns? ·/)).not.toBeInTheDocument();
  });

  it("opens the conversation when its row is clicked", async () => {
    const user = setupUser();
    const { onOpen } = renderTable([conversation("conv-a")]);
    await user.click(screen.getByText("Answer in conv-a"));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledWith("conv-a");
  });

  it("opens the conversation when the row outside a link is clicked", async () => {
    const user = setupUser();
    const { onOpen } = renderTable([conversation("conv-a")]);
    const row = screen.getByText("Answer in conv-a").closest("a")!
      .parentElement!;
    await user.click(row);
    expect(onOpen).toHaveBeenCalledWith("conv-a");
  });

  it("shows the tool names when the last turn has no reply", () => {
    renderTable([
      conversation("conv-a", {
        response_preview: null,
        tool_names: ["book_slot", "send_sms"],
      }),
    ]);
    expect(screen.getByText("book_slot, send_sms")).toBeInTheDocument();
  });

  it("links each row to its own conversation", () => {
    renderTable([conversation("conv a/1")]);
    const href =
      "/agents/ag-1?tab=monitoring&view=conversations&conversationId=conv%20a%2F1";
    for (const el of screen.getAllByText("conv a/1")) {
      expect(el.closest("a")).toHaveAttribute("href", href);
    }
  });
});
