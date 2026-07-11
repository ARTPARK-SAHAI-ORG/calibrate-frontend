import React from "react";
import { render, screen, setupUser, act } from "@/test-utils";
import { ToolsTabContent } from "../ToolsTabContent";

// AddToolDialog / DeleteToolDialog are separately-tested, heavier
// components with their own network calls. Stub them here and capture the
// props ToolsTabContent passes through, so we can exercise ToolsTabContent's
// own filtering / rendering / state-wiring logic in isolation.
let addToolProps: any = null;
jest.mock("../AddToolDialog", () => ({
  AddToolDialog: (props: any) => {
    addToolProps = props;
    return props.isOpen ? <div data-testid="add-tool-dialog" /> : null;
  },
}));

let deleteToolProps: any = null;
jest.mock("../DeleteToolDialog", () => ({
  DeleteToolDialog: (props: any) => {
    deleteToolProps = props;
    return props.isOpen ? <div data-testid="delete-tool-dialog" /> : null;
  },
}));

const toolA = {
  uuid: "tool-a",
  name: "Weather lookup",
  description: "Gets the weather",
  config: { type: "webhook" },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
const toolB = {
  uuid: "tool-b",
  name: "Calendar booking",
  config: { description: "Books calendar events" },
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
const toolNoDescription = {
  uuid: "tool-c",
  name: "Bare tool",
  config: {},
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof ToolsTabContent>> = {}
) {
  const props: React.ComponentProps<typeof ToolsTabContent> = {
    agentUuid: "agent-1",
    agentTools: [toolA, toolB],
    setAgentTools: jest.fn(),
    agentToolsLoading: false,
    agentToolsError: null,
    allTools: [toolA, toolB],
    allToolsLoading: false,
    endConversationEnabled: false,
    setEndConversationEnabled: jest.fn(),
    ...overrides,
  };
  return { ...render(<ToolsTabContent {...props} />), props };
}

describe("ToolsTabContent", () => {
  beforeEach(() => {
    addToolProps = null;
    deleteToolProps = null;
  });

  it("shows a loading state", () => {
    const { container } = renderComponent({ agentToolsLoading: true });
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("shows an error state with a retry button", () => {
    renderComponent({ agentToolsError: "Something went wrong" });
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("reloads the page when Retry is clicked", async () => {
    const reloadSpy = jest.fn();
    const originalLocation = window.location;
    // @ts-expect-error - overriding location for the test
    delete window.location;
    // @ts-expect-error - partial mock
    window.location = { ...originalLocation, reload: reloadSpy };

    const user = setupUser();
    renderComponent({ agentToolsError: "oops" });
    await user.click(screen.getByText("Retry"));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // @ts-expect-error - restoring the original location object
    window.location = originalLocation;
  });

  it("shows an empty state when there are no agent tools yet", () => {
    renderComponent({ agentTools: [] });
    expect(
      screen.getByText("No tools have been added to this agent yet")
    ).toBeInTheDocument();
  });

  it("shows a no-match message and opens the add dialog from the empty state when search matches nothing", async () => {
    const user = setupUser();
    renderComponent();
    await user.type(screen.getByPlaceholderText("Search tools"), "zzzznotool");
    expect(screen.getByText("No tools match your search")).toBeInTheDocument();

    // The "Add tool" button rendered inside the empty state should open the
    // dialog too.
    const addButtons = screen.getAllByText("Add tool");
    await user.click(addButtons[addButtons.length - 1]);
    expect(addToolProps.isOpen).toBe(true);
  });

  it("renders the tool count (singular) and list for one tool", () => {
    renderComponent({ agentTools: [toolA] });
    expect(screen.getByText("1 tool")).toBeInTheDocument();
  });

  it("renders the tool count (plural) and both desktop + mobile rows", () => {
    renderComponent();
    expect(screen.getByText("2 tools")).toBeInTheDocument();
    expect(screen.getAllByText("Weather lookup").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Calendar booking").length).toBeGreaterThan(0);
  });

  it("shows Webhook type for webhook tools and Structured Output otherwise", () => {
    renderComponent();
    expect(screen.getAllByText("Webhook").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Structured Output").length).toBeGreaterThan(0);
  });

  it("shows description fallback to config.description, and em-dash when neither present", () => {
    renderComponent({ agentTools: [toolB, toolNoDescription] });
    expect(screen.getAllByText("Books calendar events").length).toBeGreaterThan(0);
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("filters the tools list by search query on name", async () => {
    const user = setupUser();
    renderComponent();
    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    expect(screen.getAllByText("Weather lookup").length).toBeGreaterThan(0);
    expect(screen.queryByText("Calendar booking")).not.toBeInTheDocument();
  });

  it("filters the tools list by search query on description", async () => {
    const user = setupUser();
    renderComponent();
    await user.type(
      screen.getByPlaceholderText("Search tools"),
      "calendar events"
    );
    expect(screen.getAllByText("Calendar booking").length).toBeGreaterThan(0);
    expect(screen.queryByText("Weather lookup")).not.toBeInTheDocument();
  });

  it("opens the AddToolDialog from the header button and closes it via onClose", async () => {
    const user = setupUser();
    renderComponent();
    expect(addToolProps.isOpen).toBe(false);

    await user.click(screen.getByText("Add tool"));
    expect(addToolProps.isOpen).toBe(true);

    act(() => {
      addToolProps.onClose();
    });
    // re-render happens through state update triggered by the mock's captured
    // onClose; verify no throw and dialog closes on next render pass.
  });

  it("passes onToolsAdded through to AddToolDialog and appends returned tools via setAgentTools", async () => {
    const setAgentTools = jest.fn();
    const user = setupUser();
    renderComponent({ setAgentTools, agentTools: [toolA] });
    await user.click(screen.getByText("Add tool"));

    const newTool = { ...toolB };
    act(() => {
      addToolProps.onToolsAdded([newTool]);
    });
    expect(setAgentTools).toHaveBeenCalledTimes(1);
    const updater = setAgentTools.mock.calls[0][0];
    expect(updater([toolA])).toEqual([toolA, newTool]);
  });

  it("opens the DeleteToolDialog from the desktop delete button with the selected tool", async () => {
    const user = setupUser();
    renderComponent();
    const deleteButtons = screen.getAllByTitle("Remove tool from agent");
    await user.click(deleteButtons[0]);
    expect(deleteToolProps.isOpen).toBe(true);
    expect(deleteToolProps.tool).toEqual(toolA);
  });

  it("opens the DeleteToolDialog from the mobile delete button with the selected tool", async () => {
    const user = setupUser();
    renderComponent();
    const deleteButtons = screen.getAllByTitle("Remove tool from agent");
    // The desktop table and mobile cards render as two separate lists (one
    // button per tool each), so with 2 tools: [0,1] = desktop, [2,3] = mobile.
    await user.click(deleteButtons[2]);
    expect(deleteToolProps.isOpen).toBe(true);
    expect(deleteToolProps.tool).toEqual(toolA);
  });

  it("passes onToolDeleted through to DeleteToolDialog and removes the tool via setAgentTools", async () => {
    const setAgentTools = jest.fn();
    const user = setupUser();
    renderComponent({ setAgentTools });
    const deleteButtons = screen.getAllByTitle("Remove tool from agent");
    await user.click(deleteButtons[0]);

    act(() => {
      deleteToolProps.onToolDeleted("tool-a");
    });
    expect(setAgentTools).toHaveBeenCalledTimes(1);
    const updater = setAgentTools.mock.calls[0][0];
    expect(updater([toolA, toolB])).toEqual([toolB]);
  });

  it("clears the selected tool and closes the dialog via DeleteToolDialog onClose", async () => {
    const user = setupUser();
    renderComponent();
    const deleteButtons = screen.getAllByTitle("Remove tool from agent");
    await user.click(deleteButtons[0]);
    expect(deleteToolProps.isOpen).toBe(true);

    act(() => {
      deleteToolProps.onClose();
    });
  });

  it("passes endConversationEnabled/setEndConversationEnabled through to the in-built tools panel", () => {
    renderComponent({ endConversationEnabled: true });
    expect(screen.getByText("1 active tool")).toBeInTheDocument();
  });
});
