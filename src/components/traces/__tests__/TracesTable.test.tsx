import { render, screen, setupUser } from "@/test-utils";
import {
  TracesTable,
  formatTraceDate,
  formatToolArgs,
  traceOutputPreview,
} from "../TracesTable";
import type { TraceSummary } from "@/lib/tracesApi";

function trace(overrides: Partial<TraceSummary> = {}): TraceSummary {
  return {
    uuid: "t1",
    message_id: "msg-1",
    conversation_id: "conv-1",
    agent_id: "ag-1",
    input_preview: "When is the next vaccination?",
    response_preview: "At 14 weeks.",
    turn_count: 3,
    tool_call_count: 1,
    metadata_count: 2,
    created_at: "2026-07-20T10:00:00Z",
    ...overrides,
  };
}

function renderTable(props: Partial<React.ComponentProps<typeof TracesTable>> = {}) {
  const onOpen = jest.fn();
  const onDelete = jest.fn();
  const onToggleSelectAll = jest.fn();
  const checkboxProps = jest.fn(() => ({
    checked: false,
    onToggle: jest.fn(),
    disabled: false,
    label: "Select trace",
  }));
  render(
    <TracesTable
      traces={[trace()]}
      checkboxProps={checkboxProps}
      allSelected={false}
      hasSelectableItems
      onToggleSelectAll={onToggleSelectAll}
      onOpen={onOpen}
      onDelete={onDelete}
      {...props}
    />,
  );
  return { onOpen, onDelete, onToggleSelectAll };
}

describe("formatTraceDate", () => {
  it("formats an ISO timestamp", () => {
    expect(formatTraceDate("2026-07-20T10:00:00Z")).toMatch(/2026/);
  });
  it("returns the raw value for an unparseable date", () => {
    expect(formatTraceDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatToolArgs", () => {
  it("joins keys and values on one line", () => {
    expect(
      formatToolArgs({
        extraction: { awc_code: null },
        errors: "AWC code ke ank spasht nahi the.",
      }),
    ).toBe(
      'extraction: {"awc_code":null} · errors: AWC code ke ank spasht nahi the.',
    );
  });
  it("returns null when there are no arguments", () => {
    expect(formatToolArgs(null)).toBeNull();
    expect(formatToolArgs({})).toBeNull();
  });
});

describe("traceOutputPreview", () => {
  it("prefers the text reply", () => {
    expect(
      traceOutputPreview({
        response_preview: "At 14 weeks.",
        tool_names: ["get_schedule"],
      }),
    ).toBe("At 14 weeks.");
  });
  it("falls back to tool names when there is no reply", () => {
    expect(
      traceOutputPreview({
        response_preview: null,
        tool_names: ["process_user_turn", "lookup"],
      }),
    ).toBe("process_user_turn, lookup");
  });
  it("returns null when neither a reply nor tool names are present", () => {
    expect(
      traceOutputPreview({ response_preview: "  ", tool_names: [] }),
    ).toBeNull();
  });
});

describe("TracesTable", () => {
  it("renders the input preview in the Input column", () => {
    renderTable();

    expect(
      screen.getAllByText("When is the next vaccination?"),
    ).toHaveLength(2);
    expect(screen.queryByText("msg-1")).not.toBeInTheDocument();
    expect(screen.getAllByText("At 14 weeks.").length).toBeGreaterThan(0);
  });

  it("shows tool names in the Output column when there is no text reply", () => {
    renderTable({
      traces: [
        trace({
          response_preview: null,
          tool_names: ["process_user_turn"],
        }),
      ],
    });
    expect(screen.getAllByText("process_user_turn").length).toBeGreaterThan(0);
    expect(screen.queryByText("Tool calls only")).not.toBeInTheDocument();
  });

  it("shows tool arguments under the name when the list includes them", () => {
    renderTable({
      traces: [
        trace({
          response_preview: null,
          tool_names: ["process_user_turn"],
          tool_calls: [
            {
              tool: "process_user_turn",
              arguments: {
                extraction: { awc_code: null },
                errors: "AWC code ke ank spasht nahi the.",
              },
            },
          ],
        }),
      ],
    });
    expect(screen.getAllByText("process_user_turn").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/extraction: \{"awc_code":null\}/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/errors: AWC code ke ank spasht nahi the\./).length,
    ).toBeGreaterThan(0);
  });

  it("does not show a placeholder when there is no reply and no tool names", () => {
    renderTable({
      traces: [trace({ response_preview: null })],
    });
    expect(screen.queryByText("Tool calls only")).not.toBeInTheDocument();
  });

  it("still renders input when message id is missing", () => {
    renderTable({
      traces: [trace({ message_id: null, conversation_id: null })],
    });

    expect(screen.queryByText("No message ID")).not.toBeInTheDocument();
    expect(screen.queryByText("No conversation ID")).not.toBeInTheDocument();
    expect(screen.getAllByText("When is the next vaccination?")).toHaveLength(2);
  });

  it("shows only the simplified desktop columns", () => {
    renderTable();

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.queryByText("Response")).not.toBeInTheDocument();
    for (const name of ["Conversation", "Turns", "Tools"]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("conv-1")).not.toBeInTheDocument();
    expect(screen.queryByText("3 turns")).not.toBeInTheDocument();
  });

  it("opens a trace when its row is clicked", async () => {
    const user = setupUser();
    const { onOpen } = renderTable();
    // The desktop row shows the created date; click it.
    await user.click(screen.getAllByText("When is the next vaccination?")[0]);
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("deletes a trace without opening the row", async () => {
    const user = setupUser();
    const { onDelete, onOpen } = renderTable();
    await user.click(screen.getAllByTitle("Delete trace")[0]);
    expect(onDelete).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toggles select-all from the header", async () => {
    const user = setupUser();
    const { onToggleSelectAll } = renderTable();
    await user.click(screen.getByLabelText("Select all traces"));
    expect(onToggleSelectAll).toHaveBeenCalled();
  });
});
