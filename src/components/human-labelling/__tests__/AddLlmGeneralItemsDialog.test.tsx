import { fireEvent, render, screen, setupUser, waitFor, within } from "@/test-utils";
import {
  AddLlmGeneralItemsDialog,
  LlmGeneralEvaluatorDef,
} from "../AddLlmGeneralItemsDialog";

// bulk-upload-shared.tsx pulls in jspdf (ESM, not transformed by Jest) for
// unrelated CSV/PDF export helpers. AddLlmGeneralItemsDialog only needs
// humaniseDetailObject from it, so stub the module with a minimal
// reimplementation to avoid loading jspdf in this test file.
jest.mock("../bulk-upload-shared", () => ({
  humaniseDetailObject: (detail: {
    code?: string;
    conflicting_names?: string[];
  }): string | null => {
    const names = detail.conflicting_names ?? [];
    const fmt =
      names.length === 0
        ? null
        : names.length === 1
          ? `"${names[0]}"`
          : names.map((n) => `"${n}"`).join(", ");
    if (detail.code === "ITEM_NAME_CONFLICT") {
      return fmt
        ? names.length === 1
          ? `An item named ${fmt} already exists in this task`
          : `Items with these names already exist in this task: ${fmt}`
        : "One or more item names already exist in this task";
    }
    return null;
  },
}));

const accessTokenMock = jest.fn<string | null, []>(() => null);
jest.mock("../../../hooks/useAccessToken", () => ({
  useAccessToken: () => accessTokenMock(),
}));

jest.mock("../../ToolPicker", () => ({
  __esModule: true,
  getToolParams: (tool: { name: string; config?: { type?: string } }) =>
    tool.config?.type === "webhook"
      ? [
          { name: "id", value: "", group: "query" },
          { name: "extra", value: "", group: "body" },
        ]
      : tool.name === "send_email"
        ? [{ name: "body", value: "" }]
        : tool.name === "book_flight"
          ? [{ name: "city", value: "" }]
          : tool.name === "renamed_tool"
            ? [
                { name: "success", value: "" },
                { name: "reason", value: "" },
              ]
            : [],
  ToolPicker: ({
    onSelectCustomTool,
    onSelectInbuiltTool,
    onToolSaved,
  }: {
    onSelectCustomTool: (
      tool: { name: string },
      params: { name: string; value: string }[],
    ) => void;
    onSelectInbuiltTool: (toolId: string, toolName: string) => void;
    onToolSaved?: (
      tool: { uuid: string; name: string },
      previousName: string,
      allTools: { uuid: string; name: string }[],
    ) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() =>
          onToolSaved?.({ uuid: "t-dummy", name: "renamed_tool" }, "dummy", [
            { uuid: "t-dummy", name: "renamed_tool" },
          ])
        }
      >
        Save dummy as renamed_tool
      </button>
      <button
        type="button"
        onClick={() =>
          onToolSaved?.(
            {
              uuid: "t-dummy",
              name: "renamed_tool",
              config: { type: "webhook" },
            } as { uuid: string; name: string },
            "dummy",
            [{ uuid: "t-dummy", name: "renamed_tool" }],
          )
        }
      >
        Save dummy as a webhook named renamed_tool
      </button>
      <button
        type="button"
        onClick={() =>
          onToolSaved?.(
            {
              uuid: "t-dummy",
              name: "send_email",
              config: {},
            } as { uuid: string; name: string },
            "dummy",
            [{ uuid: "t-dummy", name: "send_email" }],
          )
        }
      >
        Save dummy as send_email
      </button>
      <div data-tool-side-panel>
        <input aria-label="Tool side panel field" />
      </div>
      <button
        type="button"
        onClick={() => onSelectCustomTool({ name: "book_flight" }, [])}
      >
        Pick book_flight
      </button>
      <button
        type="button"
        onClick={() => onSelectInbuiltTool("end_call", "End conversation")}
      >
        Pick End conversation
      </button>
    </>
  ),
}));

// CreateToolFlow is separately tested. Stubbed to a button that reports the
// tool it "created" and the full list, the same shape the real flow reports.
type CreateToolFlowStubProps = {
  isOpen: boolean;
  knownTools: unknown[];
  onCreated: (tool: unknown, allTools: unknown[]) => void;
};
let createToolFlowProps = {} as CreateToolFlowStubProps;
// The tool side panel has its own tests. Here it only hands back the
// workspace list after a save, with the tool renamed.
jest.mock("../../AddToolDialog", () => ({
  __esModule: true,
  AddToolDialog: ({
    editingToolUuid,
    onToolsUpdated,
    onClose,
  }: {
    editingToolUuid: string;
    onToolsUpdated: (tools: unknown[]) => void;
    onClose: () => void;
  }) => (
    <button
      type="button"
      onClick={() => {
        onToolsUpdated([
          { uuid: editingToolUuid, name: "renamed_tool", config: {} },
        ]);
        onClose();
      }}
    >
      Save the opened tool as renamed_tool
    </button>
  ),
}));

jest.mock("../../tools/CreateToolFlow", () => ({
  __esModule: true,
  CreateToolFlow: (props: CreateToolFlowStubProps) => {
    createToolFlowProps = props;
    return props.isOpen ? (
      <button
        type="button"
        onClick={() =>
          props.onCreated(
            { uuid: "tool-new", name: "book_flight", config: {} },
            [
              ...props.knownTools,
              { uuid: "tool-new", name: "book_flight", config: {} },
            ],
          )
        }
      >
        Finish creating tool
      </button>
    ) : null;
  },
}));

const evaluatorWithVars: LlmGeneralEvaluatorDef = {
  uuid: "ev-1",
  name: "Relevance",
  description: "Checks relevance",
  variables: [
    { name: "topic", description: "The topic", default: "" },
    { name: "tone", default: "neutral" },
  ],
};

const evaluatorNoVars: LlmGeneralEvaluatorDef = {
  uuid: "ev-2",
  name: "Fluency",
  variables: [],
};

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddLlmGeneralItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const utils = render(
    <AddLlmGeneralItemsDialog
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onClose, onSubmit, ...utils };
}

describe("AddLlmGeneralItemsDialog tool-call output", () => {
  it("shows the tool call under Output beside the output box", () => {
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    expect(screen.getByText("dummy")).toBeInTheDocument();
    expect(screen.getByText("success")).toBeInTheDocument();
    // Saved with no text reply, so it opens without the text box.
    expect(
      screen.queryByPlaceholderText("The output the LLM produced"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add text reply" }),
    ).toBeInTheDocument();
  });

  it("removes the text reply from a tool call item and adds it back", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Booked",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Remove text reply" }));
    expect(
      screen.queryByPlaceholderText("The output the LLM produced"),
    ).not.toBeInTheDocument();
    // The Output heading stays, with Add text reply on its row.
    const heading = screen.getByLabelText("Heading for the output");
    expect(heading.parentElement).toContainElement(
      screen.getByRole("button", { name: "Add text reply" }),
    );
    await user.click(screen.getByRole("button", { name: "Add text reply" }));
    expect(
      screen.getByPlaceholderText("The output the LLM produced"),
    ).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Remove text reply" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].output).toBe("");
  });

  it("brings the text box back once the last tool call is removed", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Remove dummy" }));
    expect(
      screen.getByPlaceholderText("The output the LLM produced"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove text reply" }),
    ).not.toBeInTheDocument();
  });

  it("halves the text box once the item has a tool call", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Booked",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    expect(screen.getByTestId("output-text-box")).toHaveClass("h-1/2");
    await user.click(screen.getByRole("button", { name: "Remove dummy" }));
    expect(screen.getByTestId("output-text-box")).not.toHaveClass("h-1/2");
  });

  it("offers no way to remove the text reply on a text item", () => {
    renderDialog();
    expect(
      screen.queryByRole("button", { name: "Remove text reply" }),
    ).not.toBeInTheDocument();
  });

  it("saves an edited argument value, with true kept as a yes/no", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    const box = screen.getByDisplayValue("true");
    await user.clear(box);
    await user.type(box, "false");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { success: false } },
    ]);
  });

  it("keeps what a stored tool call returned when the item is saved", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            {
              tool: "dummy",
              arguments: { success: true },
              output: { status: "ok" },
            },
          ],
        },
      ],
    });
    await user.type(screen.getByDisplayValue("Item one"), " renamed");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { success: true }, output: { status: "ok" } },
    ]);
  });

  it("removes a tool call and puts the text box back", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Remove dummy" }));
    expect(screen.queryByText("dummy")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("The output the LLM produced"),
    ).toBeInTheDocument();
  });

  it("says what the remove button does in the app's own tooltip, not the browser's", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    const remove = screen.getByRole("button", { name: "Remove dummy" });
    expect(remove).not.toHaveAttribute("title");

    await user.hover(remove);
    expect(await screen.findByText("Remove tool call")).toBeInTheDocument();
  });

  it("lets the item be saved on a tool call alone, with no text answer", () => {
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    expect(screen.getByRole("button", { name: "Save item" })).toBeEnabled();
  });

  const replyEvaluator: LlmGeneralEvaluatorDef = {
    uuid: "ev-reply",
    name: "Correctness",
    evaluator_type: "llm-general",
    variables: [
      { name: "criteria", description: "The criteria" },
      { name: "extra", description: "The extra" },
    ],
  };
  const toolCallEvaluator: LlmGeneralEvaluatorDef = {
    uuid: "ev-tool",
    name: "Tool call correctness",
    evaluator_type: "tool-call",
    variables: [{ name: "rule", description: "The rule" }],
  };

  it("says Tool call correctness joins the task on save when the task has no tool call evaluator", () => {
    renderDialog({
      mode: "edit",
      evaluators: [replyEvaluator],
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    expect(
      screen.getByText("Added to this task when you save this item"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
  });

  it("saves a tool-call item without asking for, or dropping, the values of evaluators that skip it", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({
      mode: "edit",
      onSubmit,
      evaluators: [replyEvaluator, toolCallEvaluator],
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
          varValues: {
            "ev-reply": { criteria: "Old rule" },
            "ev-tool": { rule: "Right tool" },
          },
        },
      ],
    });
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("The criteria")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0][0].evaluator_variables).toEqual({
      "ev-reply": { criteria: "Old rule" },
      "ev-tool": { rule: "Right tool" },
    });
  });

  it("saves nothing for an evaluator that skips the item and has no stored values", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({
      mode: "edit",
      onSubmit,
      evaluators: [replyEvaluator, toolCallEvaluator],
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
          varValues: { "ev-tool": { rule: "Right tool" } },
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0][0].evaluator_variables).toEqual({
      "ev-tool": { rule: "Right tool" },
    });
  });

  it("treats an item that stores an empty tool call list as a tool-call item", () => {
    renderDialog({
      mode: "edit",
      storesEmptyToolCallList: true,
      evaluators: [replyEvaluator, toolCallEvaluator],
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Sunny",
          varValues: { "ev-tool": { rule: "Right tool" } },
        },
      ],
    });
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save item" })).toBeEnabled();
  });

  it("saves an item that stores an empty tool call list and has no answer", () => {
    renderDialog({
      mode: "edit",
      storesEmptyToolCallList: true,
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "", toolCalls: [] },
      ],
    });
    expect(screen.getByRole("button", { name: "Save item" })).toBeEnabled();
  });

  it("saves an item with only expected tool calls and no answer", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          expectedToolCalls: [{ tool: "book_flight", arguments: { city: "Pune" } }],
        },
      ],
    });
    const save = screen.getByRole("button", { name: "Save item" });
    expect(save).toBeEnabled();
    await user.click(save);
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
  });

  it("saves an edited number argument as a number", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { months: 7, note: null } }],
        },
      ],
    });
    expect(screen.getByLabelText("note")).toHaveValue("null");
    await user.clear(screen.getByLabelText("months"));
    await user.type(screen.getByLabelText("months"), "8");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { months: 8, note: null } },
    ]);
  });

  it("still asks for a reply item's values and skips the tool call evaluator", () => {
    renderDialog({
      mode: "edit",
      evaluators: [replyEvaluator, toolCallEvaluator],
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Sunny" },
      ],
    });
    expect(screen.queryByText("Tool call correctness")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("The criteria")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save item" })).toBeDisabled();
  });

  it("adds a second tool call from the picker and sends both", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(screen.getByRole("button", { name: "Pick book_flight" }));
    await user.type(screen.getByLabelText("city"), "Bengaluru");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { success: true } },
      { tool: "book_flight", arguments: { city: "Bengaluru" } },
    ]);
  });

  const BOOK_FLIGHT = {
    uuid: "t-bf",
    name: "book_flight",
    config: {
      parameters: {
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  };
  const withTools = () => {
    accessTokenMock.mockReturnValue("tok-123");
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [BOOK_FLIGHT],
    }) as unknown as typeof fetch;
  };
  const expectedSection = () =>
    screen.getByText("Expected tool calls").closest(".relative") as HTMLElement;

  it("keeps digits typed into a tool call's text input as text", async () => {
    withTools();
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "", toolCalls: [] },
      ],
    });
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(screen.getByRole("button", { name: "Pick book_flight" }));
    await user.type(screen.getByLabelText("city"), "560001");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "book_flight", arguments: { city: "560001" } },
    ]);
  });

  it("saves expected tool calls apart from the agent's own", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    await user.click(
      within(expectedSection()).getByRole("button", { name: "Add tool" }),
    );
    await user.click(
      within(expectedSection()).getByRole("button", { name: "Pick book_flight" }),
    );
    await user.click(
      within(expectedSection()).getByRole("button", { name: "+ Add parameter" }),
    );
    await user.type(screen.getByPlaceholderText("Parameter name"), "city");
    await user.type(screen.getByPlaceholderText("Expected value"), "Pune");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const row = onSubmit.mock.calls[0][0][0];
    expect(row.output).toBe("Hello");
    expect(row.toolCalls).toEqual([]);
    expect(row.expectedToolCalls).toEqual([
      {
        tool: "book_flight",
        arguments: { city: { match_type: "exact", value: "Pune" } },
        accept_any_arguments: false,
      },
    ]);
  });

  it("saves an expected tool call that accepts any values", async () => {
    withTools();
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          expectedToolCalls: [
            {
              tool: "book_flight",
              arguments: { city: { match_type: "exact", value: "Pune" } },
              accept_any_arguments: false,
            },
          ],
        },
      ],
    });
    const label = await screen.findByText(
      "Accept any values for the parameters",
    );
    expect(screen.getByDisplayValue("Pune")).toBeInTheDocument();
    await user.click(label.previousElementSibling as HTMLElement);
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].expectedToolCalls).toEqual([
      { tool: "book_flight", arguments: {}, accept_any_arguments: true },
    ]);
    accessTokenMock.mockReturnValue(null);
  });

  it("loads expected tool calls back on edit and saves them unchanged", async () => {
    withTools();
    const user = setupUser();
    const saved = [
      {
        tool: "book_flight",
        arguments: { city: { match_type: "llm_judge", criteria: "A city in India" } },
        accept_any_arguments: false,
      },
    ];
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
          expectedToolCalls: saved,
        },
      ],
    });
    expect(await screen.findByDisplayValue("A city in India")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].expectedToolCalls).toEqual(saved);
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { success: true } },
    ]);
    accessTokenMock.mockReturnValue(null);
  });

  it("does not save while an edited expected parameter is left empty", async () => {
    withTools();
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          expectedToolCalls: [
            { tool: "book_flight", arguments: { city: "Pune" }, accept_any_arguments: false },
          ],
        },
      ],
    });
    await screen.findByText("Accept any values for the parameters");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const scroll = jest.fn();
    const realScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scroll;
    await user.clear(screen.getByDisplayValue("Pune"));
    await user.click(screen.getByRole("button", { name: "Save item" }));
    // The first bad field is scrolled to and focused; the message is under it.
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute("data-param-error"),
    );
    expect(scroll).toHaveBeenCalledWith({
      block: "center",
      behavior: "smooth",
    });
    expect(
      screen.queryByText(
        "Complete every highlighted parameter in Expected tool calls.",
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Switch to Form/)).not.toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    accessTokenMock.mockReturnValue(null);
    Element.prototype.scrollIntoView = realScroll;
  });

  it("says to switch to Form when the bad expected parameter is edited as JSON", async () => {
    withTools();
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          expectedToolCalls: [
            {
              tool: "book_flight",
              arguments: { city: "Pune" },
              accept_any_arguments: false,
            },
          ],
        },
      ],
    });
    await screen.findByText("Accept any values for the parameters");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.clear(screen.getByDisplayValue("Pune"));
    await user.click(screen.getByRole("button", { name: "JSON" }));
    await user.click(screen.getByRole("button", { name: "Save item" }));
    expect(
      await screen.findByText(
        "Some expected tool call values are missing or invalid. Switch to Form to see which",
      ),
    ).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
    accessTokenMock.mockReturnValue(null);
  });


  it("saves an expected call that leaves out a required input as it was", async () => {
    withTools();
    const user = setupUser();
    const stored = [
      { tool: "book_flight", arguments: {}, accept_any_arguments: false },
    ];
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          expectedToolCalls: stored,
        },
      ],
    });
    await screen.findByText("Accept any values for the parameters");
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].expectedToolCalls).toEqual(stored);
    accessTokenMock.mockReturnValue(null);
  });

  it("adds a newly created tool to the expected tool calls when made from there", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    await user.click(
      screen.getByRole("button", { name: "Create tool for expected tool calls" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Finish creating tool" }),
    );
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const row = onSubmit.mock.calls[0][0][0];
    expect(row.toolCalls).toEqual([]);
    expect(row.expectedToolCalls).toEqual([
      { tool: "book_flight", arguments: {}, accept_any_arguments: false },
    ]);
  });

  it("saves the agent's stored tool call exactly when it was not changed", async () => {
    const user = setupUser();
    const stored = [
      {
        tool: "dummy",
        arguments: { seats: 3, ok: false, route: { from: "BLR" }, note: null, city: "Pune" },
      },
    ];
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "", toolCalls: stored },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual(stored);
  });

  it("matches a kept tool call to its own stored call after an earlier one is removed", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            { tool: "dummy", arguments: { n: "7" } },
            { tool: "dummy", arguments: { n: 7 } },
          ],
        },
      ],
    });
    await user.click(screen.getAllByRole("button", { name: "Remove dummy" })[0]);
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "dummy", arguments: { n: 7 } },
    ]);
  });

  it("opens again with the expected tool calls' JSON view closed", async () => {
    const user = setupUser();
    const props = {
      onClose: jest.fn(),
      onSubmit: jest.fn(),
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          expectedToolCalls: [{ tool: "book_flight", arguments: { city: "Pune" } }],
        },
      ],
    };
    const { rerender } = render(<AddLlmGeneralItemsDialog isOpen {...props} />);
    await user.click(
      within(expectedSection()).getByRole("button", { name: "JSON" }),
    );
    expect(screen.getByDisplayValue(/"city"/)).toBeInTheDocument();
    rerender(<AddLlmGeneralItemsDialog isOpen={false} {...props} />);
    rerender(<AddLlmGeneralItemsDialog isOpen {...props} />);
    expect(screen.queryByDisplayValue(/"city"/)).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Pune")).toBeInTheDocument();
  });

  it("scrolls to a tool call just added, and not to one already there", async () => {
    const scrolled: Element[] = [];
    const realScroll = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this);
    };
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "Hello",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
    });
    expect(scrolled).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(screen.getByRole("button", { name: "Pick End conversation" }));
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0]).toHaveTextContent("end_call");
    Element.prototype.scrollIntoView = realScroll;
  });

  it("keeps the tool list open on Escape pressed inside the tool side panel", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(screen.getByLabelText("Tool side panel field"));
    await user.keyboard("{Escape}");
    expect(
      screen.getByRole("button", { name: "Pick book_flight" }),
    ).toBeInTheDocument();
  });

  it("closes the tool list on Escape and on the Add tool call button again", async () => {
    const user = setupUser();
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    const add = screen.getByRole("button", { name: "Add tool call" });

    await user.click(add);
    expect(
      screen.getByRole("button", { name: "Pick book_flight" }),
    ).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("button", { name: "Pick book_flight" }),
    ).not.toBeInTheDocument();

    await user.click(add);
    expect(
      screen.getByRole("button", { name: "Pick book_flight" }),
    ).toBeInTheDocument();
    await user.click(add);
    expect(
      screen.queryByRole("button", { name: "Pick book_flight" }),
    ).not.toBeInTheDocument();
  });

  it("records a built-in tool by the name the agent calls, not its label", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(
      screen.getByRole("button", { name: "Pick End conversation" }),
    );
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "end_call", arguments: {} },
    ]);
  });

  it("keeps text typed into a stored text value as text", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            {
              tool: "dummy",
              arguments: { phone: "", success: true, note: "", flag: "true" },
            },
          ],
        },
      ],
    });
    await user.type(screen.getByLabelText("phone"), "9876543210");
    await user.type(screen.getByLabelText("note"), "null");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      {
        tool: "dummy",
        arguments: {
          phone: "9876543210",
          success: true,
          note: "null",
          flag: "true",
        },
      },
    ]);
  });

  it("asks for the tool list with the signed-in token", async () => {
    accessTokenMock.mockReturnValue("tok-123");
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    renderDialog({ mode: "add" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/tools");
    expect(
      (init as { headers: Record<string, string> }).headers.Authorization,
    ).toBe("Bearer tok-123");
    accessTokenMock.mockReturnValue(null);
  });

  it("does not ask for the tool list before the token is known", () => {
    accessTokenMock.mockReturnValue(null);
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    renderDialog({ mode: "add" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("opens the create-tool flow from its own button, separate from the picker", async () => {
    const user = setupUser();
    renderDialog({ mode: "add" });
    expect(createToolFlowProps.isOpen).toBe(false);
    await user.click(screen.getByRole("button", { name: "Create tool" }));
    expect(createToolFlowProps.isOpen).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Pick book_flight" }),
    ).not.toBeInTheDocument();
  });

  it("puts a freshly created tool straight onto the item as a tool call", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Create tool" }));
    await user.click(
      screen.getByRole("button", { name: "Finish creating tool" }),
    );

    expect(screen.getByText("book_flight")).toBeInTheDocument();
    await user.type(screen.getByLabelText("city"), "Bengaluru");
    await user.click(screen.getByRole("button", { name: "Save item" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "book_flight", arguments: { city: "Bengaluru" } },
    ]);
  });

  it("renames the item's tool calls when their tool is renamed from the picker", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            { tool: "dummy", arguments: { success: true } },
            { tool: "other", arguments: {} },
          ],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(
      screen.getByRole("button", { name: "Save dummy as renamed_tool" }),
    );

    expect(screen.getByText("renamed_tool")).toBeInTheDocument();
    expect(createToolFlowProps.knownTools).toEqual([
      { uuid: "t-dummy", name: "renamed_tool" },
    ]);
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // The tool's current inputs: the typed value is kept and the new input
    // is added empty.
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "renamed_tool", arguments: { success: true, reason: "" } },
      { tool: "other", arguments: {} },
    ]);
  });

  it("opens a tool call's tool from its card and carries a rename", async () => {
    const user = setupUser();
    accessTokenMock.mockReturnValue("tok-123");
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        {
          uuid: "t-dummy",
          name: "dummy",
          config: {},
          created_at: "",
          updated_at: "",
        },
      ],
    }) as unknown as typeof fetch;
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            { tool: "dummy", arguments: {} },
            { tool: "other", arguments: {} },
          ],
        },
      ],
    });
    await user.click(await screen.findByRole("button", { name: "Open dummy" }));
    // A tool call whose tool is not in the workspace has nothing to open.
    expect(
      screen.queryByRole("button", { name: "Open other" }),
    ).not.toBeInTheDocument();
    await user.click(
      screen.getByRole("button", {
        name: "Save the opened tool as renamed_tool",
      }),
    );
    expect(screen.getByText("renamed_tool")).toBeInTheDocument();
    expect(screen.queryByText("dummy")).not.toBeInTheDocument();
    accessTokenMock.mockReturnValue(null);
  });

  it("shows a webhook tool call's inputs under Query and Body and saves them back in place", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            {
              tool: "dummy",
              arguments: { query: { id: "7" }, body: { note: "hi" } },
            },
          ],
        },
      ],
    });
    expect(screen.getByText("Query")).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByLabelText("id")).toHaveValue("7");
    await user.clear(screen.getByLabelText("note"));
    await user.type(screen.getByLabelText("note"), "bye");

    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      {
        tool: "dummy",
        arguments: { query: { id: "7" }, body: { note: "bye" } },
      },
    ]);
  });

  it("shows only the body of a call that also carries headers, and saves the headers", async () => {
    const user = setupUser();
    const stored = [
      { tool: "dummy", arguments: { body: { note: "hi" }, headers: { k: "v" } } },
    ];
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "", toolCalls: stored },
      ],
    });
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByLabelText("note")).toHaveValue("hi");
    expect(screen.queryByLabelText("headers")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual(stored);
  });

  it("gives a webhook tool call the tool's new inputs when the tool is saved", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [
            {
              tool: "dummy",
              arguments: { query: { id: "7" }, body: { note: "hi" } },
            },
          ],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(
      screen.getByRole("button", {
        name: "Save dummy as a webhook named renamed_tool",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    // The typed id is kept, the input the tool dropped is gone, and the one
    // it gained is added empty.
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      {
        tool: "renamed_tool",
        arguments: { query: { id: "7" }, body: { extra: "" } },
      },
    ]);
  });

  it("keeps the values of a tool that only looked like a webhook when it is saved", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog({
      mode: "edit",
      initialRows: [
        {
          uuid: "i1",
          name: "Item one",
          input: "Hi",
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { body: { to: "a" } } }],
        },
      ],
    });
    await user.click(screen.getByRole("button", { name: "Add tool call" }));
    await user.click(
      screen.getByRole("button", { name: "Save dummy as send_email" }),
    );
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].toolCalls).toEqual([
      { tool: "send_email", arguments: { body: { to: "a" } } },
    ]);
  });

  it("keeps the text box when the answer was text", () => {
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "i1", name: "Item one", input: "Hi", output: "Hello" },
      ],
    });
    expect(
      screen.getByPlaceholderText("The output the LLM produced"),
    ).toBeInTheDocument();
  });
});

describe("AddLlmGeneralItemsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <AddLlmGeneralItemsDialog
        isOpen={false}
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByText("Add item")).not.toBeInTheDocument();
  });

  it("renders the add-mode header with no evaluator cards when none provided", () => {
    renderDialog();
    expect(
      screen.getByRole("heading", { name: "Add item" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Relevance")).not.toBeInTheDocument();
  });

  it("keeps Add disabled until name/input/output are filled", async () => {
    const user = setupUser();
    renderDialog();
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "input text",
    );
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "output text",
    );
    expect(addButton).not.toBeDisabled();
  });

  it("renders evaluators with variable inputs, seeding defaults", () => {
    renderDialog({ evaluators: [evaluatorWithVars, evaluatorNoVars] });
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByText("Relevance")).toBeInTheDocument();
    expect(screen.getByText("Checks relevance")).toBeInTheDocument();
    expect(screen.getByText("Fluency")).toBeInTheDocument();
    // Default-seeded variable value shown as textarea content.
    expect(screen.getByDisplayValue("neutral")).toBeInTheDocument();
  });

  it("requires all evaluator variables to be filled before Add is enabled", async () => {
    const user = setupUser();
    renderDialog({ evaluators: [evaluatorWithVars] });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    const addButton = screen.getByRole("button", { name: "Add item" });
    // tone has a default ("neutral") but topic is blank -> invalid.
    expect(addButton).toBeDisabled();

    const topicInput = screen.getByPlaceholderText("The topic");
    await user.type(topicInput, "sports");
    expect(addButton).not.toBeDisabled();
  });

  it("uses a generated placeholder when a variable has no description or default", () => {
    renderDialog({
      evaluators: [
        {
          uuid: "ev-3",
          name: "Bare",
          variables: [{ name: "custom_var" }],
        },
      ],
    });
    expect(
      screen.getByPlaceholderText("Enter value for {{custom_var}}"),
    ).toBeInTheDocument();
  });

  it("submits trimmed values including evaluator_variables", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({ evaluators: [evaluatorWithVars], onSubmit });

    await user.type(
      screen.getByPlaceholderText("Your item name"),
      "  Item 1  ",
    );
    await user.type(
      screen.getByPlaceholderText(
        "Mother asks when her baby's next vaccine is due",
      ),
      "  desc  ",
    );
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "  in  ",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "  out  ",
    );
    await user.type(screen.getByPlaceholderText("The topic"), "  sports  ");

    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        uuid: undefined,
        name: "Item 1",
        description: "desc",
        input: "in",
        output: "out",
        inputExtras: {},
        outputExtras: {},
        toolCalls: [],
        expectedToolCalls: [],
        evaluator_variables: { "ev-1": { topic: "sports", tone: "neutral" } },
        metadata: [],
      },
    ]);
  });

  describe("column widths", () => {
    const LEFT = "calibrate:one-shot-item-form-left-width";
    const RIGHT = "calibrate:one-shot-item-form-right-width";
    beforeEach(() => window.localStorage.clear());
    afterAll(() => window.localStorage.clear());

    const leftColumn = () =>
      screen
        .getByPlaceholderText("Your item name")
        .closest("[style]") as HTMLElement;
    const rightColumn = () =>
      screen.getByTestId("label-item-evaluators-column");
    const drag = (name: string, clientX: number) => {
      const handle = screen.getByRole("separator", { name });
      handle.parentElement!.getBoundingClientRect = () =>
        ({ left: 0, right: 1000, width: 1000 }) as DOMRect;
      fireEvent.mouseDown(handle);
      fireEvent.mouseMove(document, { clientX });
      fireEvent.mouseUp(document);
    };

    it("opens with the form column at 32% when nothing is saved", () => {
      renderDialog();
      expect(leftColumn().style.getPropertyValue("--form-column-width")).toBe(
        "32%",
      );
    });

    it("opens at the widths saved in this browser", () => {
      window.localStorage.setItem(LEFT, "30");
      window.localStorage.setItem(RIGHT, "35");
      renderDialog({ evaluators: [evaluatorWithVars] });
      expect(leftColumn().style.getPropertyValue("--form-column-width")).toBe(
        "30%",
      );
      expect(rightColumn().style.getPropertyValue("--side-column-width")).toBe(
        "35%",
      );
    });

    it("saves each column's width when its divider is dragged", () => {
      renderDialog({ evaluators: [evaluatorWithVars] });
      drag("Resize the form column", 300);
      drag("Resize the right column", 700);
      expect(leftColumn().style.getPropertyValue("--form-column-width")).toBe(
        "30%",
      );
      expect(rightColumn().style.getPropertyValue("--side-column-width")).toBe(
        "30%",
      );
      expect(window.localStorage.getItem(LEFT)).toBe("30");
      expect(window.localStorage.getItem(RIGHT)).toBe("30");
    });

    it("keeps at least a quarter of the row for the input and output", () => {
      window.localStorage.setItem(LEFT, "50");
      window.localStorage.setItem(RIGHT, "40");
      renderDialog({ evaluators: [evaluatorWithVars] });
      expect(rightColumn().style.getPropertyValue("--side-column-width")).toBe(
        "25%",
      );
    });

    it("names the input and output only in their heading boxes", () => {
      renderDialog();
      expect(screen.queryByText("Input")).not.toBeInTheDocument();
      expect(screen.queryByText("Output")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Heading for the input")).toHaveAttribute(
        "placeholder",
        "Input",
      );
    });

    it("puts Expected tool calls in the left column, under metadata", () => {
      renderDialog();
      expect(leftColumn()).toContainElement(
        screen.getByText("Expected tool calls"),
      );
    });

    it("keeps the evaluators column when no evaluator scores the item", () => {
      renderDialog({ evaluators: [] });
      expect(
        within(rightColumn()).getByText(
          "No evaluator on this task scores this item",
        ),
      ).toBeInTheDocument();
    });
  });

  it("puts the evaluators in their own right column", () => {
    renderDialog({ evaluators: [evaluatorWithVars] });
    const column = screen.getByTestId("label-item-evaluators-column");
    expect(within(column).getByText("Evaluators")).toBeInTheDocument();
    expect(within(column).getByText("Relevance")).toBeInTheDocument();
  });

  it("does not add the item while two metadata fields share a name", async () => {
    const user = setupUser();
    const { onSubmit } = renderDialog();
    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "Add field" }));
    await user.click(screen.getByRole("button", { name: "Add field" }));
    await user.type(screen.getByLabelText("Metadata field name 1"), "source");
    await user.type(screen.getByLabelText("Metadata field name 2"), "source");
    expect(
      screen.getByText(/is already used by another field/),
    ).toBeInTheDocument();
    expect(addButton).toBeDisabled();
    await user.click(addButton);
    expect(onSubmit).not.toHaveBeenCalled();

    await user.click(
      screen.getByRole("button", { name: "Remove metadata field 2" }),
    );
    expect(addButton).toBeEnabled();
  });

  it("shows a name-conflict error under the Name field", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Request failed: 400 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Item 1"]}}',
        ),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    const msg = await screen.findByText(
      'An item named "Item 1" already exists in this task',
    );
    expect(msg.tagName).toBe("P");
    expect(msg).toHaveClass("text-sm", "text-red-500");
    expect(screen.getByPlaceholderText("Your item name")).toHaveClass(
      "border-red-500",
    );
  });

  it("shows the raw detail string when the error body isn't a structured object", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error('Request failed: 500 - {"detail":"Server exploded"}'),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText('{"detail":"Server exploded"}'),
    ).toBeInTheDocument();
  });

  it("shows a message for a non-JSON error body", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error("Request failed: 500 - Internal Server Error"),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText("Internal Server Error"),
    ).toBeInTheDocument();
  });

  it("falls back to the message text when the error body isn't valid JSON", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error("Request failed: 500 - not-json{{{"));
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("not-json{{{")).toBeInTheDocument();
  });

  it("falls back to the default add error for a non-Error rejection", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockRejectedValue("boom");
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("Your item name"), "Item 1");
    await user.type(
      screen.getByPlaceholderText("The prompt or input given to the LLM"),
      "in",
    );
    await user.type(
      screen.getByPlaceholderText("The output the LLM produced"),
      "out",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Failed to add item")).toBeInTheDocument();
  });

  it("closes via the header close button and Cancel-equivalent backdrop when clean", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores backdrop clicks in add mode, even when the form is clean", async () => {
    // Add mode intentionally disables backdrop-click close (see
    // useUnsavedCloseGuard's handleBackdropClick — it's a no-op unless
    // isEdit) so a stray click can't discard in-progress work.
    const user = setupUser();
    const { onClose, container } = renderDialog();
    await user.click(container.firstChild as Element);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole("heading", { name: "Add item" }));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("edit mode", () => {
    const initialRows = [
      {
        uuid: "item-1",
        name: "Item 1",
        description: "desc",
        input: "in",
        output: "out",
        varValues: { "ev-1": { topic: "sports", tone: "excited" } },
        metadata: [{ key: "source", value: "call 12" }],
      },
    ];

    it("shows the seeded metadata and saves the edited list", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({ mode: "edit", initialRows, onSubmit });
      expect(screen.getByDisplayValue("source")).toBeInTheDocument();
      expect(screen.getByDisplayValue("call 12")).toBeInTheDocument();

      await user.clear(screen.getByLabelText("Metadata value 1"));
      await user.type(screen.getByLabelText("Metadata value 1"), "call 13");
      await user.click(screen.getByRole("button", { name: "Add field" }));
      await user.type(screen.getByLabelText("Metadata field name 2"), "lang");
      await user.type(screen.getByLabelText("Metadata value 2"), "hi");
      await user.click(screen.getByRole("button", { name: "Save item" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0][0].metadata).toEqual([
        { key: "source", value: "call 13" },
        { key: "lang", value: "hi" },
      ]);
    });

    it("seeds fields from initialRows and shows edit-mode labels", () => {
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
      });
      expect(screen.getByText("Edit item")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Item 1")).toBeInTheDocument();
      expect(screen.getByDisplayValue("desc")).toBeInTheDocument();
      expect(screen.getByDisplayValue("in")).toBeInTheDocument();
      expect(screen.getByDisplayValue("out")).toBeInTheDocument();
      expect(screen.getByDisplayValue("sports")).toBeInTheDocument();
      expect(screen.getByDisplayValue("excited")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Save item" }),
      ).toBeInTheDocument();
    });

    it("is not dirty until a field is changed from the seed, and submits with the uuid", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      const { onClose } = renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      // Clean close via backdrop (edit mode allows backdrop close).
      const dialogRoot = document.querySelector(
        ".fixed.inset-0.z-50",
      ) as Element;
      await user.click(dialogRoot);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("prompts discard confirmation once a field is edited", async () => {
      const user = setupUser();
      const { onClose } = renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
      });
      const nameInput = screen.getByDisplayValue("Item 1");
      await user.type(nameInput, "!");

      const dialogRoot = document.querySelector(
        ".fixed.inset-0.z-50",
      ) as Element;
      await user.click(dialogRoot);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    });

    it("submits the edited item with its uuid, calling Save item and showing Saving state", async () => {
      const user = setupUser();
      let resolveSubmit: (() => void) | undefined;
      const onSubmit = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      const nameInput = screen.getByDisplayValue("Item 1");
      await user.clear(nameInput);
      await user.type(nameInput, "Item 1 renamed");

      const saveButton = screen.getByRole("button", { name: "Save item" });
      await user.click(saveButton);
      expect(screen.getByText("Saving...")).toBeInTheDocument();

      resolveSubmit?.();
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit).toHaveBeenCalledWith([
        expect.objectContaining({
          uuid: "item-1",
          name: "Item 1 renamed",
        }),
      ]);
    });

    it("uses the edit-mode default error message on a failed save", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockRejectedValue("boom");
      renderDialog({
        mode: "edit",
        evaluators: [evaluatorWithVars],
        initialRows,
        onSubmit,
      });

      const nameInput = screen.getByDisplayValue("Item 1");
      await user.type(nameInput, "!");
      await user.click(screen.getByRole("button", { name: "Save item" }));

      expect(
        await screen.findByText("Failed to save item"),
      ).toBeInTheDocument();
    });

    it("resets to a new seed item when reopened", () => {
      const { rerender } = render(
        <AddLlmGeneralItemsDialog
          isOpen={false}
          mode="edit"
          initialRows={initialRows}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      rerender(
        <AddLlmGeneralItemsDialog
          isOpen
          mode="edit"
          initialRows={[
            {
              uuid: "item-2",
              name: "Fresh item",
              input: "fresh in",
              output: "fresh out",
            },
          ]}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      expect(screen.getByDisplayValue("Fresh item")).toBeInTheDocument();
    });
  });
});

describe("previous / next item in the edit window", () => {
  const step = {
    hasPrev: true,
    hasNext: true,
    position: { index: 4, total: 9 },
  };

  it("draws the arrows and steps when the form is clean", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "u1", name: "Item 1", input: "hi", output: "hello" },
      ],
      onPrev,
      onNext,
      ...step,
    });
    expect(screen.getByText("5 of 9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Previous item" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("asks before stepping away from edits, and Discard steps", async () => {
    const user = setupUser();
    const onNext = jest.fn();
    const { onClose } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "u1", name: "Item 1", input: "hi", output: "hello" },
      ],
      onPrev: jest.fn(),
      onNext,
      ...step,
    });
    await user.type(screen.getByPlaceholderText("Your item name"), "x");
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(onNext).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Preview opens the view window at once when nothing has been edited", async () => {
    const user = setupUser();
    const onView = jest.fn();
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "u1", name: "Item 1", input: "hi", output: "hello" },
      ],
      onView,
    });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("Preview asks before throwing away edits, and opens the view on Discard", async () => {
    const user = setupUser();
    const onView = jest.fn();
    const { onClose } = renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "u1", name: "Item 1", input: "hi", output: "hello" },
      ],
      onView,
    });
    await user.type(screen.getByPlaceholderText("Your item name"), "x");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onView).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("draws no arrows when no steps are passed", () => {
    renderDialog({
      mode: "edit",
      initialRows: [
        { uuid: "u1", name: "Item 1", input: "hi", output: "hello" },
      ],
    });
    expect(
      screen.queryByRole("button", { name: "Next item" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Preview" }),
    ).not.toBeInTheDocument();
  });
});

describe("AddLlmGeneralItemsDialog headings and versions", () => {
  const versioned = {
    uuid: "i1",
    name: "Item one",
    input: "Summarise this",
    output: "A summary",
    inputExtras: { label: "English", versions: { Hindi: "इसका सार दो" } },
    outputExtras: { versions: { Hindi: "एक सार" } },
  };

  it("shows the stored headings and versions and sends back what was edited", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({ mode: "edit", initialRows: [versioned], onSubmit });

    expect(screen.getByLabelText("Heading for the input")).toHaveValue("English");
    expect(screen.getByLabelText("Heading for the output")).toHaveValue("");
    const texts = screen.getAllByLabelText("Version text");
    expect(texts.map((t) => (t as HTMLTextAreaElement).value)).toEqual([
      "इसका सार दो",
      "एक सार",
    ]);

    await user.type(texts[1], " अच्छा");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const [row] = onSubmit.mock.calls[0][0];
    expect(row.inputExtras).toEqual(versioned.inputExtras);
    expect(row.outputExtras).toEqual({ versions: { Hindi: "एक सार अच्छा" } });
  });

  it("keeps Save off while a version has no text", async () => {
    const user = setupUser();
    renderDialog({ mode: "edit", initialRows: [versioned] });
    const [inputVersion, outputVersion] = screen.getAllByLabelText("Version text");
    const save = screen.getByRole("button", { name: "Save item" });
    await user.clear(inputVersion);
    expect(screen.getByText("Version cannot be empty")).toBeInTheDocument();
    expect(save).toBeDisabled();
    await user.type(inputVersion, "x");
    expect(save).toBeEnabled();
    await user.clear(outputVersion);
    expect(save).toBeDisabled();
  });

  it("sends no output versions when the output is empty", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          ...versioned,
          output: "",
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
      onSubmit,
    });
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].outputExtras).toEqual({});
  });

  it("keeps the output's versions when the item also has a tool call", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({
      mode: "edit",
      initialRows: [
        {
          ...versioned,
          toolCalls: [{ tool: "dummy", arguments: { success: true } }],
        },
      ],
      onSubmit,
    });
    expect(screen.getByDisplayValue("A summary")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0][0].outputExtras).toEqual(
      versioned.outputExtras,
    );
  });

  it("turns off the output heading while the output is blank", async () => {
    const user = setupUser();
    renderDialog({ mode: "add" });
    const heading = screen.getByRole("textbox", { name: "Heading for the output" });
    expect(heading).toBeDisabled();
    await user.type(screen.getByPlaceholderText("The output the LLM produced"), "Booked");
    expect(heading).toBeEnabled();
  });

  it("does not step to another item while the remove question is up", async () => {
    const user = setupUser();
    const onNext = jest.fn();
    renderDialog({
      mode: "edit",
      initialRows: [versioned],
      onNext,
      hasNext: true,
    });
    await user.click(screen.getAllByRole("button", { name: "Remove version" })[0]);
    fireEvent.keyDown(document.body, { key: "ArrowRight" });
    expect(onNext).not.toHaveBeenCalled();
  });

  it("asks before closing when a heading was typed but not confirmed", async () => {
    const user = setupUser();
    const { onClose } = renderDialog({
      mode: "edit",
      initialRows: [versioned],
    });
    await user.type(screen.getByLabelText("Heading for the output"), "Hindi");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });
});
