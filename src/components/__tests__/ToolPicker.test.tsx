import { render, screen, setupUser } from "@/test-utils";
import { ToolPicker, AvailableTool, getToolParams } from "../ToolPicker";

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
});
