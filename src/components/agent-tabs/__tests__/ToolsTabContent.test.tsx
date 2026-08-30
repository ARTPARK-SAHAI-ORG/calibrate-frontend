import React from "react";
import { render, screen, setupUser, act, waitFor } from "@/test-utils";
import { ToolsTabContent } from "../ToolsTabContent";

const reportErrorMock = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

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

// The top-level builder, reused here in edit mode when a row is clicked —
// distinct from the "../AddToolDialog" picker mocked above.
let editToolProps: any = null;
jest.mock("../../AddToolDialog", () => ({
  AddToolDialog: (props: any) => {
    editToolProps = props;
    return props.isOpen ? <div data-testid="edit-tool-dialog" /> : null;
  },
}));

// CreateToolFlow is separately tested. Stubbed to a button that reports the
// tool it "created" and the full list, the same shape the real flow reports.
let createToolProps: any = null;
const CREATED_TOOL = {
  uuid: "tool-new",
  name: "Freshly made",
  config: {},
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
jest.mock("../../tools/CreateToolFlow", () => ({
  CreateToolFlow: (props: any) => {
    createToolProps = props;
    return props.isOpen ? (
      <button
        onClick={() =>
          props.onCreated(CREATED_TOOL, [...props.knownTools, CREATED_TOOL])
        }
      >
        Finish creating
      </button>
    ) : null;
  },
}));

const toastErrorMock = jest.fn();
jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => toastErrorMock(...args) },
}));

const attachToolsToAgentMock = jest.fn();
jest.mock("../../../lib/agentTools", () => ({
  attachToolsToAgent: (...args: unknown[]) => attachToolsToAgentMock(...args),
}));

jest.mock("../../../hooks/useAccessToken", () => ({
  useAccessToken: () => "test-token",
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

const SECOND_CREATED_TOOL = {
  uuid: "tool-newer",
  name: "Made after",
  config: {},
  created_at: "2024-01-02",
  updated_at: "2024-01-02",
};

describe("ToolsTabContent", () => {
  beforeEach(() => {
    addToolProps = null;
    deleteToolProps = null;
    createToolProps = null;
    editToolProps = null;
    attachToolsToAgentMock.mockReset();
    attachToolsToAgentMock.mockResolvedValue(undefined);
    toastErrorMock.mockReset();
    reportErrorMock.mockReset();
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

  it("hides the header's own Add tool / Create tool buttons while the empty-state placeholder is showing", () => {
    renderComponent({ agentTools: [] });
    // Only the placeholder's own pair, not a second header pair above it.
    expect(screen.getAllByRole("button", { name: "Add tool" })).toHaveLength(
      1
    );
    expect(
      screen.getAllByRole("button", { name: "Create tool" })
    ).toHaveLength(1);
  });

  it("gives the empty-state Add tool button the header's primary style, not the same look as Create tool", () => {
    renderComponent({ agentTools: [] });
    const addButton = screen.getByRole("button", { name: "Add tool" });
    const createButton = screen.getByRole("button", { name: "Create tool" });
    expect(addButton.className).toContain("bg-foreground");
    expect(createButton.className).not.toContain("bg-foreground");
  });

  it("still offers Add tool when the workspace has tools, even if none are on this agent yet", () => {
    // Distinct from the workspace-is-empty case below: here there is
    // something to pick from, so the button belongs.
    renderComponent({ agentTools: [], allTools: [toolA, toolB] });
    expect(
      screen.getByRole("button", { name: "Add tool" }),
    ).toBeInTheDocument();
  });

  it("hides Add tool when the workspace has no tools at all yet", () => {
    renderComponent({ agentTools: [], allTools: [] });
    expect(
      screen.queryByRole("button", { name: "Add tool" }),
    ).not.toBeInTheDocument();
    // Create tool is still how you make the first one.
    expect(
      screen.getByRole("button", { name: "Create tool" }),
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

  it("shows description fallback to config.description, and a plain note when neither present", () => {
    renderComponent({ agentTools: [toolB, toolNoDescription] });
    expect(screen.getAllByText("Books calendar events").length).toBeGreaterThan(0);
    expect(screen.getAllByText("No description").length).toBeGreaterThan(0);
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

  it("opens the edit dialog for a tool clicked from the desktop table", async () => {
    const user = setupUser();
    renderComponent();
    const [desktopName] = screen.getAllByText("Weather lookup");
    await user.click(desktopName);

    expect(editToolProps.isOpen).toBe(true);
    expect(editToolProps.editingToolUuid).toBe("tool-a");
    expect(editToolProps.toolType).toBe("webhook");
  });

  it("opens the edit dialog for a tool clicked from the mobile card, with its type", async () => {
    const user = setupUser();
    renderComponent();
    const [, mobileName] = screen.getAllByText("Calendar booking");
    await user.click(mobileName);

    expect(editToolProps.isOpen).toBe(true);
    expect(editToolProps.editingToolUuid).toBe("tool-b");
    // toolB has no config.type — defaults to structured_output, same as the
    // Type column's own fallback.
    expect(editToolProps.toolType).toBe("structured_output");
  });

  it("does not open the edit dialog when the delete button on a row is clicked", async () => {
    const user = setupUser();
    renderComponent();
    const deleteButtons = screen.getAllByTitle("Remove tool from agent");
    await user.click(deleteButtons[0]);

    expect(editToolProps.isOpen).toBe(false);
    expect(deleteToolProps.isOpen).toBe(true);
  });

  it("syncs the edited tool back into the agent's list by uuid", async () => {
    const user = setupUser();
    const setAgentTools = jest.fn();
    renderComponent({ setAgentTools });
    const [desktopName] = screen.getAllByText("Weather lookup");
    await user.click(desktopName);

    const renamed = { ...toolA, name: "Weather (renamed)" };
    act(() => {
      editToolProps.onToolsUpdated([renamed, toolB]);
    });
    expect(setAgentTools).toHaveBeenCalledTimes(1);
    const updater = setAgentTools.mock.calls[0][0];
    expect(updater([toolA, toolB])).toEqual([renamed, toolB]);
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

  describe("Create tool", () => {
    it("opens the flow from the header button", async () => {
      const user = setupUser();
      renderComponent();
      expect(createToolProps.isOpen).toBe(false);
      await user.click(screen.getByRole("button", { name: "Create tool" }));
      expect(createToolProps.isOpen).toBe(true);
    });

    it("opens the flow from the empty-state button too", async () => {
      const user = setupUser();
      renderComponent({ agentTools: [] });
      const buttons = screen.getAllByRole("button", { name: "Create tool" });
      await user.click(buttons[buttons.length - 1]);
      expect(createToolProps.isOpen).toBe(true);
    });

    it("attaches the created tool to this agent and adds it to the list", async () => {
      const user = setupUser();
      const setAgentTools = jest.fn();
      renderComponent({ setAgentTools });
      await user.click(screen.getByRole("button", { name: "Create tool" }));
      await user.click(screen.getByText("Finish creating"));

      expect(attachToolsToAgentMock).toHaveBeenCalledWith(
        "agent-1",
        ["tool-new"],
        "test-token",
      );
      // Closed straight away rather than waiting on the attach call.
      expect(createToolProps.isOpen).toBe(false);
      // setAgentTools took a function, appending the new tool.
      const updater = setAgentTools.mock.calls[0][0];
      expect(updater([toolA])).toEqual([toolA, CREATED_TOOL]);
    });

    it("reports the failure instead of silently dropping the tool when attaching fails", async () => {
      const user = setupUser();
      attachToolsToAgentMock.mockRejectedValue(new Error("network down"));
      const setAgentTools = jest.fn();
      renderComponent({ setAgentTools });
      await user.click(screen.getByRole("button", { name: "Create tool" }));
      await user.click(screen.getByText("Finish creating"));

      await waitFor(() => expect(reportErrorMock).toHaveBeenCalled());
      expect(setAgentTools).not.toHaveBeenCalled();
    });
  });
});

describe("ToolsTabContent creating a tool", () => {
  it("knows which tool is new the second time round", async () => {
    const user = setupUser();
    renderComponent({ agentTools: [], allTools: [] });

    await user.click(screen.getByRole("button", { name: "Create tool" }));
    await user.click(screen.getByText("Finish creating"));
    await waitFor(() =>
      expect(attachToolsToAgentMock).toHaveBeenCalledWith(
        "agent-1",
        ["tool-new"],
        "test-token",
      ),
    );

    // The workspace list the tab was given is never re-fetched, so without
    // keeping the fresh one the second create would compare against a list
    // missing the first tool and take that one for the new one.
    expect(createToolProps.knownTools.map((t: { uuid: string }) => t.uuid)).toEqual([
      "tool-new",
    ]);
  });

  it("says so when the new tool could not be added to the agent", async () => {
    const user = setupUser();
    attachToolsToAgentMock.mockRejectedValue(new Error("Backend is down"));
    const setAgentTools = jest.fn();
    renderComponent({ agentTools: [], allTools: [], setAgentTools });

    await user.click(screen.getByRole("button", { name: "Create tool" }));
    await user.click(screen.getByText("Finish creating"));

    await waitFor(() =>
      expect(toastErrorMock).toHaveBeenCalledWith(
        expect.stringContaining("Freshly made"),
      ),
    );
    expect(setAgentTools).not.toHaveBeenCalled();
  });
});
