import { render, screen, setupUser } from "@/test-utils";
import { ToolPicker, AvailableTool, getToolParams } from "../ToolPicker";

// The real side panel fetches the tool; this stand-in shows what it was
// opened with and lets a test act out a save or a close.
jest.mock("../AddToolDialog", () => ({
  AddToolDialog: (props: {
    toolType: string;
    editingToolUuid: string | null;
    backendAccessToken?: string;
    onClose: () => void;
    onToolsUpdated: (tools: unknown[]) => void;
  }) => (
    <div data-testid="tool-panel">
      <span>
        {props.editingToolUuid}|{props.toolType}|{props.backendAccessToken}
      </span>
      <button
        onClick={() =>
          props.onToolsUpdated([
            {
              uuid: props.editingToolUuid,
              name: "Renamed Tool",
              config: {},
              created_at: "",
              updated_at: "",
            },
          ])
        }
      >
        Save stub
      </button>
      <button onClick={() => props.onToolsUpdated([])}>Save missing</button>
      <button onClick={props.onClose}>Close stub</button>
    </div>
  ),
}));

const CUSTOM_TOOLS: AvailableTool[] = [
  {
    uuid: "t1",
    name: "Webhook Tool",
    description: "Calls a webhook",
    config: { type: "webhook", parameters: [{ id: "p1" }, { name: "p2" }] },
    created_at: "",
    updated_at: "",
  },
  {
    uuid: "t2",
    name: "Structured Tool",
    config: {
      type: "structured_output",
      properties: { foo: {}, bar: {} },
    },
    created_at: "",
    updated_at: "",
  },
];

describe("ToolPicker", () => {
  it("shows a loading spinner and hides lists while loading", () => {
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
      />,
    );
    expect(screen.queryByText("Webhook Tool")).not.toBeInTheDocument();
    expect(screen.queryByText("In-built tools")).not.toBeInTheDocument();
  });

  it("renders inbuilt and custom tool sections", () => {
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
      />,
    );
    expect(screen.getByText("In-built tools")).toBeInTheDocument();
    expect(screen.getByText("End conversation")).toBeInTheDocument();
    expect(screen.getByText("User defined tools")).toBeInTheDocument();
    expect(screen.getByText("Webhook Tool")).toBeInTheDocument();
    expect(screen.getByText("Structured Tool")).toBeInTheDocument();
    expect(screen.getByText("Webhook")).toBeInTheDocument();
    expect(screen.getByText("Structured Output")).toBeInTheDocument();
  });

  it("calls onSelectInbuiltTool when an inbuilt tool is clicked", async () => {
    const user = setupUser();
    const onSelectInbuiltTool = jest.fn();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={onSelectInbuiltTool}
        onSelectCustomTool={jest.fn()}
      />,
    );
    await user.click(screen.getByText("End conversation"));
    expect(onSelectInbuiltTool).toHaveBeenCalledWith(
      "end_call",
      "End conversation",
    );
  });

  it("calls onSelectCustomTool with parsed params when a custom tool is clicked", async () => {
    const user = setupUser();
    const onSelectCustomTool = jest.fn();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={onSelectCustomTool}
      />,
    );
    await user.click(screen.getByText("Webhook Tool"));
    expect(onSelectCustomTool).toHaveBeenCalledWith(CUSTOM_TOOLS[0], [
      { name: "p1", value: "" },
      { name: "p2", value: "" },
    ]);
  });

  it("parses legacy object-format params for structured tools", async () => {
    const user = setupUser();
    const onSelectCustomTool = jest.fn();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={onSelectCustomTool}
      />,
    );
    await user.click(screen.getByText("Structured Tool"));
    expect(onSelectCustomTool).toHaveBeenCalledWith(CUSTOM_TOOLS[1], [
      { name: "foo", value: "" },
      { name: "bar", value: "" },
    ]);
  });

  it("excludes already-selected tools from both lists", () => {
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
        selectedToolIds={["end_call", "t1"]}
      />,
    );
    expect(screen.queryByText("End conversation")).not.toBeInTheDocument();
    expect(screen.queryByText("Webhook Tool")).not.toBeInTheDocument();
    expect(screen.getByText("Structured Tool")).toBeInTheDocument();
  });

  it("filters tools by search query, matching name or description", async () => {
    const user = setupUser();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText("Search tools"), "webhook");
    expect(screen.getByText("Webhook Tool")).toBeInTheDocument();
    expect(screen.queryByText("Structured Tool")).not.toBeInTheDocument();
    expect(screen.queryByText("End conversation")).not.toBeInTheDocument();
  });

  it("filters by description text", async () => {
    const user = setupUser();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText("Search tools"), "calls a");
    expect(screen.getByText("Webhook Tool")).toBeInTheDocument();
  });

  it("shows a 'no tools available' empty state with no search query", () => {
    render(
      <ToolPicker
        availableTools={[]}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
        selectedToolIds={["end_call"]}
      />,
    );
    expect(screen.getByText("No tools available")).toBeInTheDocument();
  });

  it("shows a 'no tools match your search' empty state with a search query", async () => {
    const user = setupUser();
    render(
      <ToolPicker
        availableTools={CUSTOM_TOOLS}
        isLoading={false}
        onSelectInbuiltTool={jest.fn()}
        onSelectCustomTool={jest.fn()}
      />,
    );
    await user.type(screen.getByPlaceholderText("Search tools"), "zzzzz");
    expect(screen.getByText("No tools match your search")).toBeInTheDocument();
  });
});

describe("getToolParams", () => {
  it("falls back to an empty name when an array param has neither id nor name", () => {
    const tool: AvailableTool = {
      uuid: "t5",
      name: "Anon Param Tool",
      config: { parameters: [{}] },
      created_at: "",
      updated_at: "",
    };
    expect(getToolParams(tool)).toEqual([{ name: "", value: "" }]);
  });

  it("reads parameters.properties shape when present", () => {
    const tool: AvailableTool = {
      uuid: "t6",
      name: "Props Tool",
      config: { parameters: { properties: { y: {} } } },
      created_at: "",
      updated_at: "",
    };
    expect(getToolParams(tool)).toEqual([{ name: "y", value: "" }]);
  });

  it("falls back to function.parameters.properties shape", () => {
    const tool: AvailableTool = {
      uuid: "t3",
      name: "Fn Tool",
      config: { function: { parameters: { properties: { x: {} } } } },
      created_at: "",
      updated_at: "",
    };
    expect(getToolParams(tool)).toEqual([{ name: "x", value: "" }]);
  });

  it("returns empty array when no parameter shape matches", () => {
    const tool: AvailableTool = {
      uuid: "t4",
      name: "Empty Tool",
      config: {},
      created_at: "",
      updated_at: "",
    };
    expect(getToolParams(tool)).toEqual([]);
  });

  it("reads a webhook tool's inputs from its query and body", () => {
    // How a saved webhook tool stores them: nothing at the top level.
    const tool: AvailableTool = {
      uuid: "w",
      name: "get_presigned_url",
      config: {
        type: "webhook",
        parameters: [],
        webhook: {
          method: "POST",
          headers: [{ name: "x-key", value: "1" }],
          queryParameters: [{ id: "test" }],
          body: { parameters: [{ id: "task_type" }, { name: "note" }] },
        },
      },
      created_at: "",
      updated_at: "",
    };
    expect(getToolParams(tool)).toEqual([
      { name: "test", value: "", group: "query" },
      { name: "task_type", value: "", group: "body" },
      { name: "note", value: "", group: "body" },
    ]);
  });

  describe("Open button", () => {
    it("opens the tool side panel in edit mode without picking the tool", async () => {
      const user = setupUser();
      const onSelectCustomTool = jest.fn();
      render(
        <ToolPicker
          availableTools={CUSTOM_TOOLS}
          isLoading={false}
          onSelectInbuiltTool={jest.fn()}
          onSelectCustomTool={onSelectCustomTool}
          accessToken="tok"
        />,
      );
      expect(screen.queryByTestId("tool-panel")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Open End conversation" }),
      ).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Open Webhook Tool" }),
      );
      expect(screen.getByText("t1|webhook|tok")).toBeInTheDocument();
      expect(onSelectCustomTool).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Close stub" }));
      expect(screen.queryByTestId("tool-panel")).not.toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Open Structured Tool" }),
      );
      expect(screen.getByText("t2|structured_output|tok")).toBeInTheDocument();
    });

    it("reports the saved tool with its name before the edit", async () => {
      const user = setupUser();
      const onToolSaved = jest.fn();
      render(
        <ToolPicker
          availableTools={CUSTOM_TOOLS}
          isLoading={false}
          onSelectInbuiltTool={jest.fn()}
          onSelectCustomTool={jest.fn()}
          onToolSaved={onToolSaved}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Open Webhook Tool" }),
      );
      await user.click(screen.getByRole("button", { name: "Save missing" }));
      expect(onToolSaved).not.toHaveBeenCalled();

      await user.click(screen.getByRole("button", { name: "Save stub" }));
      expect(onToolSaved).toHaveBeenCalledWith(
        expect.objectContaining({ uuid: "t1", name: "Renamed Tool" }),
        "Webhook Tool",
        [expect.objectContaining({ uuid: "t1" })],
      );
    });

    it("keeps clicks inside the side panel from reaching what holds the picker", async () => {
      const user = setupUser();
      const onOuterClick = jest.fn();
      render(
        <div onClick={onOuterClick}>
          <ToolPicker
            availableTools={CUSTOM_TOOLS}
            isLoading={false}
            onSelectInbuiltTool={jest.fn()}
            onSelectCustomTool={jest.fn()}
          />
        </div>,
      );
      await user.click(
        screen.getByRole("button", { name: "Open Webhook Tool" }),
      );
      onOuterClick.mockClear();
      await user.click(screen.getByRole("button", { name: "Save missing" }));
      expect(onOuterClick).not.toHaveBeenCalled();
    });

    it("keeps key presses after opening from reaching the page behind", async () => {
      const user = setupUser();
      const onWindowKey = jest.fn();
      window.addEventListener("keydown", onWindowKey);
      render(
        <ToolPicker
          availableTools={CUSTOM_TOOLS}
          isLoading={false}
          onSelectInbuiltTool={jest.fn()}
          onSelectCustomTool={jest.fn()}
        />,
      );
      await user.click(
        screen.getByRole("button", { name: "Open Webhook Tool" }),
      );
      // Right after opening, and after a click on an empty part of the panel.
      await user.keyboard("{ArrowRight}");
      await user.click(screen.getByTestId("tool-panel"));
      await user.keyboard("{ArrowLeft}");
      window.removeEventListener("keydown", onWindowKey);
      expect(onWindowKey).not.toHaveBeenCalled();
    });
  });
});
