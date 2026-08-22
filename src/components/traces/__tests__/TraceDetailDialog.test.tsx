import React from "react";
import { act, render, screen, setupUser, waitFor } from "@/test-utils";
import {
  TraceDetailDialog,
  humanTraceName,
  toTestCaseOutput,
  turnsToHistory,
} from "../TraceDetailDialog";
import { fetchTrace, TraceDetail } from "@/lib/tracesApi";

jest.mock("../../../lib/tracesApi", () => ({
  __esModule: true,
  ...jest.requireActual("../../../lib/tracesApi"),
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
  agent_id: "ag-1",
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

describe("humanTraceName", () => {
  it("uses the last user turn", () => {
    expect(
      humanTraceName({
        input: [
          { role: "user", content: "first" },
          { role: "assistant", content: "ok" },
          { role: "user", content: "second" },
        ],
      }),
    ).toBe("second");
  });
  it("falls back to Trace when there is no user text", () => {
    expect(humanTraceName({ input: [{ role: "assistant", content: "hi" }] })).toBe(
      "Trace",
    );
  });
});

describe("turnsToHistory / toTestCaseOutput", () => {
  it("drops the agent's instructions and keeps user, assistant tool calls, and tool results", () => {
    const history = turnsToHistory([
      { role: "system", content: "sys" },
      { role: "user", content: "hi", created_at: "2026-07-20T10:00:00Z" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          { id: "c1", function: { name: "lookup", arguments: '{"q":1}' } },
          "not-an-object",
        ],
      },
      { role: "tool", content: "42" },
      { role: "assistant", content: null },
    ]);
    expect(history).toEqual([
      {
        role: "user",
        content: "hi",
        created_at: "2026-07-20T10:00:00Z",
      },
      {
        role: "assistant",
        tool_calls: [
          {
            id: "c1",
            type: "function",
            function: { name: "lookup", arguments: '{"q":1}' },
          },
          {
            id: "history-tool-1",
            type: "function",
            function: { name: "Unknown tool", arguments: "{}" },
          },
        ],
      },
      { role: "tool", content: "42" },
    ]);
  });
  it("returns a reply-only output", () => {
    expect(toTestCaseOutput({ response: "hi", tool_calls: null })).toEqual({
      response: "hi",
    });
  });
  it("returns undefined output when there is no reply and no tool calls", () => {
    expect(toTestCaseOutput({ response: "  ", tool_calls: [] })).toBeUndefined();
  });
});

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

it("titles the dialog with the trace's own id and renders the shared conversation view", async () => {
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
  expect(screen.getByRole("heading", { name: "t1" })).toBeInTheDocument();
  expect(
    screen.getByText("When is the next vaccination?"),
  ).toBeInTheDocument();
  // The agent's instructions are stored on the trace but never drawn.
  expect(
    screen.queryByText("You are a vaccination assistant."),
  ).not.toBeInTheDocument();
  expect(screen.getAllByText("get_schedule")).toHaveLength(2);
  expect(screen.getByText("child_age_weeks")).toBeInTheDocument();
  expect(screen.getByText("14")).toBeInTheDocument();
  expect(screen.getAllByText("Agent Tool Call").length).toBeGreaterThan(0);
  expect(screen.queryByText("Conversation history")).not.toBeInTheDocument();
  expect(screen.queryByText("No text response")).not.toBeInTheDocument();
});

it("puts ids, created time, and metadata in the side column and omits missing ids", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );

  await waitFor(() => expect(screen.getByText("msg-1")).toBeInTheDocument());
  expect(screen.getByRole("heading", { name: "Metadata" })).toBeInTheDocument();
  expect(screen.getByText("Name")).toBeInTheDocument();
  expect(screen.getByText("Conversation")).toBeInTheDocument();
  expect(screen.getByText("conv-1")).toBeInTheDocument();
  expect(screen.getByText("Created")).toBeInTheDocument();
  expect(screen.getByText("gen_ai.request.model")).toBeInTheDocument();
  expect(screen.getByText("gpt-4")).toBeInTheDocument();
  expect(screen.queryByText("No message or conversation ID")).not.toBeInTheDocument();
});

it.each<{
  messageId: string | null;
  conversationId: string | null;
  showsName: boolean;
  showsConversation: boolean;
}>([
  {
    messageId: "msg-1",
    conversationId: null,
    showsName: true,
    showsConversation: false,
  },
  {
    messageId: null,
    conversationId: "conv-1",
    showsName: false,
    showsConversation: true,
  },
  {
    messageId: null,
    conversationId: null,
    showsName: false,
    showsConversation: false,
  },
])(
  "only lists ids that are present",
  async ({ messageId, conversationId, showsName, showsConversation }) => {
    mockFetchTrace.mockResolvedValue({
      ...detail,
      message_id: messageId,
      conversation_id: conversationId,
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
      expect(screen.getByText("Created")).toBeInTheDocument(),
    );
    expect(screen.queryByText("No message or conversation ID")).not.toBeInTheDocument();
    if (showsName) {
      expect(screen.getByText("Name")).toBeInTheDocument();
      expect(screen.getByText("msg-1")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("Name")).not.toBeInTheDocument();
    }
    if (showsConversation) {
      expect(screen.getByText("Conversation")).toBeInTheDocument();
      expect(screen.getByText("conv-1")).toBeInTheDocument();
    } else {
      expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
    }
  },
);

it("falls back to Trace when there is no trace id to show", () => {
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid={null}
    />,
  );
  expect(screen.getByRole("heading", { name: "Trace" })).toBeInTheDocument();
});

it("renders a tool-call-only output without a missing-reply placeholder", async () => {
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
  await waitFor(() => expect(screen.getByText("x")).toBeInTheDocument());
  expect(screen.queryByRole("heading", { name: "Metadata" })).not.toBeInTheDocument();
  expect(screen.queryByText("No text response")).not.toBeInTheDocument();
  expect(screen.getAllByText("Agent Tool Call").length).toBeGreaterThan(0);
});

it("leaves no empty block where the agent's instructions were", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );

  const question = await screen.findByText("When is the next vaccination?");
  // The trace has three turns: instructions, the question, the tool call.
  // Only the last two are drawn, so the conversation has two blocks.
  const conversation = question.closest("div.space-y-4");
  expect(conversation?.children).toHaveLength(2);
});

it("never shows the previous trace under the next one's heading", async () => {
  const traceA = detail;
  const traceB: TraceDetail = {
    ...detail,
    uuid: "t2",
    message_id: "msg-2",
    conversation_id: "conv-2",
    input: [{ role: "user", content: "Where is the nearest clinic?" }],
    output: { response: "At the block health centre.", tool_calls: [] },
    metadata: [{ key: "gen_ai.request.model", value: "gpt-5" }],
  };
  mockFetchTrace.mockResolvedValueOnce(traceA);
  let resolveB: (value: TraceDetail) => void = () => {};
  mockFetchTrace.mockReturnValueOnce(
    new Promise<TraceDetail>((resolve) => {
      resolveB = resolve;
    }),
  );

  // Every painted screen is recorded, so a single frame of the first trace
  // showing under the second one's request is caught.
  const painted: string[] = [];
  function Harness({ traceUuid }: { traceUuid: string }) {
    React.useLayoutEffect(() => {
      painted.push(document.body.textContent ?? "");
    });
    return (
      <TraceDetailDialog
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        traceUuid={traceUuid}
      />
    );
  }

  const { rerender } = render(<Harness traceUuid="t1" />);
  await screen.findByText("At 14 weeks, for OPV and DPT.");
  expect(screen.getByRole("heading", { name: "t1" })).toBeInTheDocument();

  painted.length = 0;
  rerender(<Harness traceUuid="t2" />);
  expect(painted.length).toBeGreaterThan(0);
  expect(
    painted.filter((screenText) =>
      screenText.includes("At 14 weeks, for OPV and DPT."),
    ),
  ).toEqual([]);

  // The title tracks the id it was asked to open, straight from the prop, so
  // it swaps before the second trace's content has even started loading.
  expect(screen.getByRole("heading", { name: "t2" })).toBeInTheDocument();

  // The second trace has not arrived yet, so nothing of the first is left.
  expect(screen.queryByText("At 14 weeks, for OPV and DPT.")).not.toBeInTheDocument();
  expect(screen.queryByText("msg-1")).not.toBeInTheDocument();
  expect(screen.queryByText("gpt-4")).not.toBeInTheDocument();

  await act(async () => {
    resolveB(traceB);
  });
  expect(await screen.findByText("At the block health centre.")).toBeInTheDocument();
  expect(screen.getByText("msg-2")).toBeInTheDocument();
});

it("does not render previous/next controls when neither callback is passed", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );
  await waitFor(() => expect(screen.getByText("msg-1")).toBeInTheDocument());
  expect(
    screen.queryByRole("button", { name: "Previous trace" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Next trace" }),
  ).not.toBeInTheDocument();
});

it("hides the controls when there is only one trace to page through", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
      onPrev={jest.fn()}
      onNext={jest.fn()}
      hasPrev={false}
      hasNext={false}
      position={{ index: 0, total: 1 }}
    />,
  );
  await waitFor(() => expect(screen.getByText("msg-1")).toBeInTheDocument());
  expect(
    screen.queryByRole("button", { name: "Previous trace" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Next trace" }),
  ).not.toBeInTheDocument();
});

it("shows position, disables the exhausted side, and fires the click handlers", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  const onPrev = jest.fn();
  const onNext = jest.fn();
  const user = setupUser();
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={false}
      hasNext={true}
      position={{ index: 0, total: 3 }}
    />,
  );
  await waitFor(() => expect(screen.getByText("msg-1")).toBeInTheDocument());

  expect(screen.getByText("1 of 3")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Previous trace" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Next trace" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Next trace" }));
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onPrev).not.toHaveBeenCalled();
});

it("navigates with arrow keys but leaves the disabled side alone", async () => {
  mockFetchTrace.mockResolvedValue(detail);
  const onPrev = jest.fn();
  const onNext = jest.fn();
  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
      onPrev={onPrev}
      onNext={onNext}
      hasPrev={false}
      hasNext={true}
      position={{ index: 0, total: 3 }}
    />,
  );
  await waitFor(() => expect(screen.getByText("msg-1")).toBeInTheDocument());

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" }));
  });
  expect(onPrev).not.toHaveBeenCalled();

  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
  });
  expect(onNext).toHaveBeenCalledTimes(1);
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

describe("a general agent's trace", () => {
  it("reads as an input and an output, not as a conversation", async () => {
    mockFetchTrace.mockResolvedValue({
      ...detail,
      input: "Practice: Compound\nAdoption type: non_adopter",
      output: { response: "Keeping your compound clean helps.", tool_calls: null },
    });

    render(
      <TraceDetailDialog
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        traceUuid="t1"
      />,
    );

    expect(await screen.findByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(
      screen.getByText(/Practice: Compound/),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Keeping your compound clean helps."),
    ).toBeInTheDocument();
    // The conversation renderer labels the agent's turn; this view does not.
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
  });

  it("shows the tools it called in place of a reply", async () => {
    mockFetchTrace.mockResolvedValue({
      ...detail,
      input: "Book a slot for next week",
      output: {
        response: null,
        tool_calls: [{ tool: "book_appointment", arguments: { date: "2026-03-14" } }],
      },
    });

    render(
      <TraceDetailDialog
        isOpen
        onClose={jest.fn()}
        accessToken="tok"
        traceUuid="t1"
      />,
    );

    expect(await screen.findByText("Output")).toBeInTheDocument();
    expect(screen.getByText("book_appointment")).toBeInTheDocument();
    expect(screen.getByText("2026-03-14")).toBeInTheDocument();
  });
});

it("shows what a tool returned, when the trace carries it", async () => {
  mockFetchTrace.mockResolvedValue({
    ...detail,
    input: "Book a slot for next week",
    output: {
      response: null,
      tool_calls: [
        {
          tool: "book_appointment",
          arguments: { date: "2026-03-14" },
          output: { confirmed: true, slot: "10:30" },
        },
      ],
    },
  });

  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );

  expect(await screen.findByText("Tool Response")).toBeInTheDocument();
  expect(screen.getByText(/"confirmed": true/)).toBeInTheDocument();
});

it("shows a tool result on a conversational agent's trace too", async () => {
  mockFetchTrace.mockResolvedValue({
    ...detail,
    input: [{ role: "user", content: "Book a slot" }],
    output: {
      response: null,
      tool_calls: [
        {
          tool: "book_appointment",
          arguments: { date: "2026-03-14" },
          output: { confirmed: true },
        },
      ],
    },
  });

  render(
    <TraceDetailDialog
      isOpen
      onClose={jest.fn()}
      accessToken="tok"
      traceUuid="t1"
    />,
  );

  expect(await screen.findByText("Tool Response")).toBeInTheDocument();
  expect(screen.getByText(/"confirmed": true/)).toBeInTheDocument();
});
