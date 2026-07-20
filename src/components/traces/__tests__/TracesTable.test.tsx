import { render, screen, setupUser } from "@/test-utils";
import { TracesTable, formatTraceDate } from "../TracesTable";
import type { TraceSummary } from "@/lib/tracesApi";

function trace(overrides: Partial<TraceSummary> = {}): TraceSummary {
  return {
    uuid: "t1",
    message_id: "msg-1",
    conversation_id: "conv-1",
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
  const onFilterConversation = jest.fn();
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
      onFilterConversation={onFilterConversation}
      {...props}
    />,
  );
  return { onOpen, onDelete, onFilterConversation, onToggleSelectAll };
}

describe("formatTraceDate", () => {
  it("formats an ISO timestamp", () => {
    expect(formatTraceDate("2026-07-20T10:00:00Z")).toMatch(/2026/);
  });
  it("returns the raw value for an unparseable date", () => {
    expect(formatTraceDate("not-a-date")).toBe("not-a-date");
  });
});

describe("TracesTable", () => {
  it("renders message id, previews, and counts (desktop table)", () => {
    renderTable();
    // message_id + previews appear in both desktop and mobile layouts.
    expect(screen.getAllByText("msg-1").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("When is the next vaccination?").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("At 14 weeks.").length).toBeGreaterThan(0);
  });

  it("shows a 'Tool calls only' placeholder when there is no response preview", () => {
    renderTable({
      traces: [trace({ response_preview: null })],
    });
    expect(screen.getAllByText("Tool calls only").length).toBeGreaterThan(0);
  });

  it("opens a trace when its row is clicked", async () => {
    const user = setupUser();
    const { onOpen } = renderTable();
    // The desktop row shows the created date; click it.
    await user.click(screen.getAllByText("msg-1")[0]);
    expect(onOpen).toHaveBeenCalledWith("t1");
  });

  it("filters by conversation without opening the row", async () => {
    const user = setupUser();
    const { onFilterConversation, onOpen } = renderTable();
    await user.click(screen.getAllByText("conv-1")[0]);
    expect(onFilterConversation).toHaveBeenCalledWith("conv-1");
    expect(onOpen).not.toHaveBeenCalled();
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
