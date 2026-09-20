import { render, screen, setupUser, waitFor } from "@/test-utils";
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

function renderTable(
  props: Partial<React.ComponentProps<typeof TracesTable>> = {},
) {
  const onOpen = jest.fn();
  const onDelete = jest.fn();
  const onToggleSelectAll = jest.fn();
  const checkboxProps = jest.fn(() => ({
    checked: false,
    onToggle: jest.fn(),
    disabled: false,
    label: "Select trace",
  }));
  const view = render(
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
  return { ...view, onOpen, onDelete, onToggleSelectAll };
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

    expect(screen.getAllByText("When is the next vaccination?")).toHaveLength(
      2,
    );
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
    expect(screen.getAllByText("When is the next vaccination?")).toHaveLength(
      2,
    );
  });

  it("shows only the simplified desktop columns", () => {
    renderTable();

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.queryByText("Scores")).not.toBeInTheDocument();
    expect(screen.queryByText("Response")).not.toBeInTheDocument();
    for (const name of ["Conversation", "Turns", "Tools"]) {
      expect(screen.queryByText(name)).not.toBeInTheDocument();
    }
    expect(screen.queryByText("conv-1")).not.toBeInTheDocument();
    expect(screen.queryByText("3 turns")).not.toBeInTheDocument();
  });

  const columns = [
    { evaluator_uuid: "ev-1", name: "Tone" },
    { evaluator_uuid: "ev-2", name: "Accuracy" },
  ];

  it("shows no evaluator columns when no evaluator can score", () => {
    renderTable({
      traces: [trace({ latest_run_status: "completed", results: [] })],
    });
    expect(screen.queryByText("—")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Scoring")).not.toBeInTheDocument();
  });

  it("shows one column per evaluator, with the verdict or the score in each", () => {
    renderTable({
      scoreColumns: columns,
      traces: [
        trace({
          latest_run_status: "completed",
          results: [
            {
              evaluator_uuid: "ev-1",
              name: "ev-1",
              output_type: "binary",
              value: 1,
              passed: true,
            },
            {
              evaluator_uuid: "ev-2",
              name: "ev-2",
              output_type: "rating",
              value: 4,
              passed: true,
            },
          ],
        }),
        trace({
          uuid: "t2",
          latest_run_status: "completed",
          results: [
            {
              evaluator_uuid: "ev-1",
              name: "ev-1",
              output_type: "binary",
              value: 0,
              passed: false,
            },
          ],
        }),
      ],
    });
    // Desktop header once, mobile block label once per card.
    expect(screen.getAllByText("Tone")).toHaveLength(3);
    expect(screen.getAllByText("Accuracy")).toHaveLength(3);
    // Desktop cell and mobile block for each row.
    expect(screen.getAllByText("Correct")).toHaveLength(2);
    expect(screen.getAllByText("Score: 4")).toHaveLength(2);
    expect(screen.getAllByText("Wrong")).toHaveLength(2);
    // The second row has no Accuracy score.
    expect(screen.getAllByText("Not scored yet")).toHaveLength(2);
  });

  it("sizes the grid inline, one track per evaluator, so Tailwind need not compile it", () => {
    renderTable({ scoreColumns: columns, traces: [trace({})] });
    const header = screen
      .getByText("Input")
      .closest("div[style]") as HTMLElement;
    expect(header.style.gridTemplateColumns).toBe(
      "40px 400px 400px 10ch 11ch 160px auto",
    );
  });

  it("marks how the scoring went beside the input, not in the columns", () => {
    renderTable({
      scoreColumns: columns,
      traces: [trace({ latest_run_status: "processing" })],
    });
    // Desktop row and mobile card.
    expect(screen.getAllByRole("img", { name: "In progress" })).toHaveLength(2);
  });

  it("says why beside a trace nothing could score, and in each of its columns", () => {
    renderTable({
      scoreColumns: columns,
      traces: [
        trace({
          latest_run_status: "skipped",
          latest_run_error: "no_usable_evaluators",
        }),
        trace({ uuid: "t2" }),
      ],
    });
    expect(
      screen.getAllByRole("img", {
        name: "No evaluators could score this trace",
      }),
    ).toHaveLength(2);
    // The skipped trace says why beside its input and again in each of its
    // two evaluator columns, on desktop and on mobile. Only the trace nothing
    // has tried yet is still waiting on a score.
    expect(screen.getAllByText("Could not run")).toHaveLength(4);
    expect(screen.getAllByText("Not scored yet")).toHaveLength(4);
  });

  it("widens an evaluator track to its own name, and uses one template everywhere", () => {
    const longName = "Answered the caller's actual question";
    renderTable({
      scoreColumns: [
        { evaluator_uuid: "ev-1", name: "Tone" },
        { evaluator_uuid: "ev-2", name: longName },
      ],
      traces: [trace({})],
    });
    // The name plus the arrow that orders the column.
    const expected = `40px 400px 400px 10ch ${longName.length + 3}ch 160px auto`;
    const header = screen
      .getByText("Input")
      .closest("div[style]") as HTMLElement;
    expect(header.style.gridTemplateColumns).toBe(expected);
    // The row is its own grid, so it has to carry the same template or the
    // columns would not line up.
    const row = screen
      .getAllByText("When is the next vaccination?")[0]
      .closest("div[style]") as HTMLElement;
    expect(row.style.gridTemplateColumns).toBe(expected);
  });

  it("shows the whole evaluator name in the header, with no hover text", () => {
    const longName = "Answered the caller's actual question";
    renderTable({
      scoreColumns: [{ evaluator_uuid: "ev-1", name: longName }],
      traces: [trace({})],
    });
    const header = screen.getAllByText(longName)[0];
    expect(header).toHaveTextContent(longName);
    expect(header).not.toHaveAttribute("title");
  });

  // jsdom reports every width as 0, so a line the column has cut short is
  // described directly by standing in for the two widths the check compares.
  function mockClipped() {
    const scrollWidth = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(300);
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(80);
    return () => {
      scrollWidth.mockRestore();
      clientWidth.mockRestore();
    };
  }

  it("shows the whole reply in hover text when the column has cut it short", async () => {
    const user = setupUser();
    const restore = mockClipped();
    const reply = "a very long reply the Output column cannot fit on one line";
    renderTable({ traces: [trace({ response_preview: reply })] });
    const before = screen.getAllByText(reply).length;
    await user.hover(screen.getAllByText(reply)[0]);
    await waitFor(() =>
      expect(screen.getAllByText(reply).length).toBeGreaterThan(before),
    );
    restore();
  });

  it("leaves a reply that already fits without hover text", async () => {
    const user = setupUser();
    renderTable();
    const line = screen.getAllByText("At 14 weeks.")[0];
    expect(line).not.toHaveAttribute("title");
    const before = screen.getAllByText("At 14 weeks.").length;
    await user.hover(line);
    expect(screen.getAllByText("At 14 weeks.").length).toBe(before);
  });

  it("shows the whole tool arguments line in hover text when it is cut short", async () => {
    const user = setupUser();
    const restore = mockClipped();
    renderTable({
      traces: [
        trace({
          response_preview: null,
          tool_names: ["process_user_turn"],
          tool_calls: [
            {
              tool: "process_user_turn",
              arguments: { errors: "AWC code ke ank spasht nahi the." },
            },
          ],
        }),
      ],
    });
    const argsLine = "errors: AWC code ke ank spasht nahi the.";
    const before = screen.getAllByText(argsLine).length;
    expect(screen.getAllByText(argsLine)[0]).not.toHaveAttribute("title");
    await user.hover(screen.getAllByText(argsLine)[0]);
    await waitFor(() =>
      expect(screen.getAllByText(argsLine).length).toBeGreaterThan(before),
    );
    restore();
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
    await user.click(screen.getAllByLabelText("Delete trace")[0]);
    expect(onDelete).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("toggles select-all from the header", async () => {
    const user = setupUser();
    const { onToggleSelectAll } = renderTable();
    await user.click(screen.getByLabelText("Select all traces"));
    expect(onToggleSelectAll).toHaveBeenCalled();
  });

  it("orders the list by an evaluator when its heading is clicked", async () => {
    const user = setupUser();
    const onSortByEvaluator = jest.fn();
    renderTable({
      scoreColumns: columns,
      sortByEvaluator: "ev-1",
      sortOrder: "asc",
      onSortByEvaluator,
      traces: [trace({})],
    });

    await user.click(
      screen.getByRole("button", { name: /^Sort traces by Tone/ }),
    );
    expect(onSortByEvaluator).toHaveBeenCalledWith("ev-1");
  });

  it("turns the arrow round to show which way the order runs", () => {
    const arrowClass = () => {
      const arrow = screen
        .getByRole("button", { name: /^Sort traces by Tone/ })
        .querySelector("svg");
      expect(arrow).not.toBeNull();
      return arrow?.getAttribute("class") ?? "";
    };
    const sorted = (sortOrder: "asc" | "desc") => ({
      scoreColumns: columns,
      sortByEvaluator: "ev-1",
      sortOrder,
      onSortByEvaluator: jest.fn(),
      traces: [trace({})],
    });

    const desc = renderTable(sorted("desc"));
    expect(arrowClass()).not.toContain("rotate-180");
    desc.unmount();

    renderTable(sorted("asc"));
    expect(arrowClass()).toContain("rotate-180");
    // The arrow is the only thing that shows it on screen, so the heading has
    // to say it too.
    expect(
      screen.getByRole("button", {
        name: "Sort traces by Tone, ordered lowest first",
      }),
    ).toBeInTheDocument();
  });

  it("leaves the evaluator heading as plain text when the list cannot be ordered", () => {
    renderTable({ scoreColumns: columns, traces: [trace({})] });

    expect(
      screen.queryByRole("button", { name: /^Sort traces by/ }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByText("Tone").length).toBeGreaterThan(0);
  });
});
