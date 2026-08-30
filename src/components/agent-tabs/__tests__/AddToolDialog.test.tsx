import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { signOut } from "next-auth/react";
import { AddToolDialog } from "../AddToolDialog";

// CreateToolFlow is separately tested. Stubbed to a button that reports the
// tool it "created" and the full updated list, the same shape the real flow
// reports.
let createToolFlowProps: any = null;
const CREATED_TOOL = {
  uuid: "tool-new",
  name: "Freshly made",
  config: {},
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
jest.mock("../../tools/CreateToolFlow", () => ({
  __esModule: true,
  CreateToolFlow: (props: any) => {
    createToolFlowProps = props;
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

// The top-level builder, reused here in edit mode from the preview panel.
// Distinct from "../AddToolDialog" (the picker itself, under test here).
let editToolDialogProps: any = null;
const EDITED_TOOL = {
  uuid: "tool-a",
  name: "Weather lookup (edited)",
  description: "Gets the weather, precisely",
  config: {},
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};
jest.mock("../../AddToolDialog", () => ({
  __esModule: true,
  AddToolDialog: (props: any) => {
    editToolDialogProps = props;
    return props.isOpen ? (
      <button onClick={() => props.onToolsUpdated([EDITED_TOOL, toolB])}>
        Finish editing
      </button>
    ) : null;
  },
}));

const deleteToolMock = jest.fn();
jest.mock("../../../lib/toolsApi", () => ({
  __esModule: true,
  deleteTool: (...args: unknown[]) => deleteToolMock(...args),
}));

let deleteConfirmationProps: any = null;
jest.mock("../../DeleteConfirmationDialog", () => ({
  __esModule: true,
  DeleteConfirmationDialog: (props: any) => {
    deleteConfirmationProps = props;
    return props.isOpen ? (
      <>
        <p>{props.message}</p>
        <button onClick={props.onConfirm}>Confirm delete</button>
        {props.extraContent}
      </>
    ) : null;
  },
}));

const toolA = {
  uuid: "tool-a",
  name: "Weather lookup",
  description: "Gets the weather",
  config: {},
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
const alreadyAdded = {
  uuid: "tool-c",
  name: "Already added tool",
  config: {},
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

function renderComponent(overrides: Partial<React.ComponentProps<typeof AddToolDialog>> = {}) {
  const props: React.ComponentProps<typeof AddToolDialog> = {
    isOpen: true,
    onClose: jest.fn(),
    agentUuid: "agent-1",
    agentTools: [alreadyAdded],
    allTools: [toolA, toolB, alreadyAdded],
    allToolsLoading: false,
    onToolsAdded: jest.fn(),
    ...overrides,
  };
  return { ...render(<AddToolDialog {...props} />), props };
}

describe("AddToolDialog", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://backend.test";
    global.fetch = jest.fn();
    (signOut as jest.Mock).mockClear();
    createToolFlowProps = null;
    editToolDialogProps = null;
    deleteConfirmationProps = null;
    deleteToolMock.mockReset();
    deleteToolMock.mockResolvedValue(undefined);
    localStorage.setItem("access_token", "test-token");
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
    localStorage.clear();
    jest.restoreAllMocks();
  });

  it("renders nothing when closed", () => {
    const { container } = renderComponent({ isOpen: false });
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a loading state", () => {
    renderComponent({ allToolsLoading: true });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("filters out tools already added to the agent", () => {
    renderComponent();
    expect(screen.getByLabelText("Select Weather lookup")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Select Calendar booking"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Already added tool"),
    ).not.toBeInTheDocument();
  });

  it("shows description fallback from config.description", () => {
    renderComponent();
    expect(screen.getByText("Books calendar events")).toBeInTheDocument();
  });

  it("offers Create tool while there are still tools to pick", async () => {
    const user = setupUser();
    renderComponent();

    // Not only on the empty screen: a tool can be written without first
    // adding everything the workspace already has.
    expect(screen.getByLabelText("Select Weather lookup")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create tool" }));
    expect(createToolFlowProps.isOpen).toBe(true);
  });

  it("shows empty state when all tools are already added", () => {
    renderComponent({ allTools: [alreadyAdded], agentTools: [alreadyAdded] });
    expect(
      screen.getByText("All available tools have been added to this agent")
    ).toBeInTheDocument();
    // The app's usual placeholder: a heading over the sentence, and the one
    // thing to do here as the filled-in button.
    expect(screen.getByText("No tools to add")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create tool" })).toHaveClass(
      "bg-foreground",
      "text-background",
    );
  });

  it("lists the workspace tools that arrive after it first renders", () => {
    // The dialog renders (as nothing) before the tools have been fetched, so a
    // copy taken on that first render is empty. It showed an empty workspace
    // for the rest of the session.
    const { rerender } = render(
      <AddToolDialog
        isOpen={false}
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentTools={[]}
        allTools={[]}
        allToolsLoading
        onToolsAdded={jest.fn()}
      />,
    );

    rerender(
      <AddToolDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentTools={[]}
        allTools={[toolA, toolB]}
        allToolsLoading={false}
        onToolsAdded={jest.fn()}
      />,
    );

    expect(screen.getByLabelText("Select Weather lookup")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Select Calendar booking"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("All available tools have been added to this agent"),
    ).not.toBeInTheDocument();
  });

  it("says the workspace has no tools, rather than that they are all added", () => {
    renderComponent({ allTools: [], agentTools: [] });
    expect(
      screen.getByText(
        "Your workspace has no tools yet. Create one and it is added to this agent.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("All available tools have been added to this agent"),
    ).not.toBeInTheDocument();
  });

  it("offers Create tool from the empty state, and comes back with the new tool selected and previewed", async () => {
    const user = setupUser();
    renderComponent({ allTools: [alreadyAdded], agentTools: [alreadyAdded] });

    expect(createToolFlowProps.isOpen).toBe(false);
    await user.click(screen.getByRole("button", { name: "Create tool" }));
    expect(createToolFlowProps.isOpen).toBe(true);
    expect(createToolFlowProps.knownTools).toEqual([alreadyAdded]);

    await user.click(screen.getByText("Finish creating"));

    // Back in the picker, not the empty state: the new tool is there,
    // checked, and shown in the preview column.
    expect(
      screen.queryByText("All available tools have been added to this agent"),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Select Freshly made")).toBeChecked();
    expect(screen.getByText("Add (1)")).toBeInTheDocument();
    // Name shows once in the row and again in the preview heading.
    expect(screen.getAllByText("Freshly made").length).toBe(2);
  });

  it("attaches a tool created from the empty state along with the rest of the selection", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
    const user = setupUser();
    const onToolsAdded = jest.fn();
    renderComponent({
      allTools: [alreadyAdded],
      agentTools: [alreadyAdded],
      onToolsAdded,
    });

    await user.click(screen.getByRole("button", { name: "Create tool" }));
    await user.click(screen.getByText("Finish creating"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(onToolsAdded).toHaveBeenCalledWith([CREATED_TOOL]);
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "https://backend.test/agent-tools",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent_uuid: "agent-1",
          tool_uuids: ["tool-new"],
        }),
      })
    );
  });

  describe("editing and deleting from the preview panel", () => {
    it("opens the edit dialog for the previewed tool, with its type", async () => {
      const user = setupUser();
      renderComponent();

      expect(editToolDialogProps.isOpen).toBe(false);
      await user.click(screen.getByTitle("Edit tool"));
      expect(editToolDialogProps.isOpen).toBe(true);
      expect(editToolDialogProps.editingToolUuid).toBe("tool-a");
      // toolA has no config.type — defaults to structured_output.
      expect(editToolDialogProps.toolType).toBe("structured_output");
    });

    it("syncs the edited tool's fresh data back into the picker by uuid", async () => {
      const user = setupUser();
      renderComponent();

      await user.click(screen.getByTitle("Edit tool"));
      await user.click(screen.getByText("Finish editing"));

      // Name shows once in the row and again in the preview heading.
      expect(screen.getAllByText("Weather lookup (edited)").length).toBe(2);
      expect(
        screen.queryByLabelText("Select Weather lookup"),
      ).not.toBeInTheDocument();
    });

    it("opens delete confirmation for the previewed tool", async () => {
      const user = setupUser();
      renderComponent();

      expect(deleteConfirmationProps.isOpen).toBe(false);
      await user.click(screen.getByTitle("Delete tool"));
      expect(deleteConfirmationProps.isOpen).toBe(true);
      expect(
        screen.getByText(
          'Are you sure you want to permanently delete "Weather lookup"? This removes it from the whole workspace, not just this agent.',
        ),
      ).toBeInTheDocument();
    });

    it("removes the tool from the picker and its selection on confirmed delete", async () => {
      const user = setupUser();
      renderComponent();

      await user.click(screen.getByLabelText("Select Weather lookup"));
      expect(screen.getByText("Add (1)")).toBeInTheDocument();

      await user.click(screen.getByTitle("Delete tool"));
      await user.click(screen.getByText("Confirm delete"));

      expect(deleteToolMock).toHaveBeenCalledWith("tool-a", "test-token");
      await waitFor(() =>
        expect(
          screen.queryByLabelText("Select Weather lookup"),
        ).not.toBeInTheDocument(),
      );
      // No longer selected either — the footer count drops with it.
      expect(screen.queryByText(/^Add \(/)).not.toBeInTheDocument();
    });

    it("reports a delete failure and keeps the tool in the list", async () => {
      deleteToolMock.mockRejectedValue(new Error("boom"));
      const user = setupUser();
      renderComponent();

      await user.click(screen.getByTitle("Delete tool"));
      await user.click(screen.getByText("Confirm delete"));

      await waitFor(() =>
        expect(screen.getByText("boom")).toBeInTheDocument(),
      );
      expect(
        screen.getByLabelText("Select Weather lookup"),
      ).toBeInTheDocument();
    });
  });

  it("filters tools by search query on name", async () => {
    const user = setupUser();
    renderComponent();

    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    expect(screen.getByLabelText("Select Weather lookup")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Calendar booking"),
    ).not.toBeInTheDocument();
  });

  it("filters tools by search query on description", async () => {
    const user = setupUser();
    renderComponent();

    await user.type(screen.getByPlaceholderText("Search tools"), "calendar events");
    expect(
      screen.getByLabelText("Select Calendar booking"),
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Select Weather lookup"),
    ).not.toBeInTheDocument();
  });

  it("shows a no-match message when search matches nothing", async () => {
    const user = setupUser();
    renderComponent();

    await user.type(screen.getByPlaceholderText("Search tools"), "zzzznotool");
    expect(screen.getByText("No tools match your search")).toBeInTheDocument();
  });

  it("does not show the footer / Add button until a tool is selected", () => {
    renderComponent();
    expect(screen.queryByText(/^Add \(/)).not.toBeInTheDocument();
  });

  it("selects and deselects tools via checkbox, updating the Add button count", async () => {
    const user = setupUser();
    renderComponent();

    await user.click(screen.getByLabelText("Select Weather lookup"));
    expect(screen.getByText("Add (1)")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Select Calendar booking"));
    expect(screen.getByText("Add (2)")).toBeInTheDocument();

    // Deselect
    await user.click(screen.getByLabelText("Select Weather lookup"));
    expect(screen.getByText("Add (1)")).toBeInTheDocument();
  });

  it("previews the first tool by default, and switches when another name is clicked", async () => {
    const user = setupUser();
    renderComponent();

    // Weather lookup is first in the (filtered) list, so it previews as
    // soon as the dialog opens — no click needed.
    expect(
      screen.queryByText("Select a tool to see its details"),
    ).not.toBeInTheDocument();
    // Description shows once in the row and again in the preview column.
    expect(screen.getAllByText("Gets the weather").length).toBe(2);
    // Being previewed does not also select it.
    expect(screen.queryByText(/^Add \(/)).not.toBeInTheDocument();

    await user.click(screen.getByText("Calendar booking"));
    expect(screen.getAllByText("Calendar booking").length).toBe(2);
    expect(screen.queryByText(/^Add \(/)).not.toBeInTheDocument();
  });

  it("closes and resets state via the header close (X) button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderComponent({ onClose });

    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    await user.click(screen.getByLabelText("Select Weather lookup"));

    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via backdrop click", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = renderComponent({ onClose });

    const backdrop = container.querySelector(".fixed.inset-0") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close when clicking inside the dialog panel", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderComponent({ onClose });

    await user.click(screen.getByText("Add Tools"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("adds selected tools successfully", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
    const user = setupUser();
    const onToolsAdded = jest.fn();
    const onClose = jest.fn();
    renderComponent({ onToolsAdded, onClose });

    await user.click(screen.getByLabelText("Select Weather lookup"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(onToolsAdded).toHaveBeenCalledWith([toolA]);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://backend.test/agent-tools",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          agent_uuid: "agent-1",
          tool_uuids: ["tool-a"],
        }),
      })
    );
  });

  it("signs out on 401 response", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 401 });
    const user = setupUser();
    const onToolsAdded = jest.fn();
    renderComponent({ onToolsAdded });

    await user.click(screen.getByLabelText("Select Weather lookup"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });
    expect(onToolsAdded).not.toHaveBeenCalled();
  });

  it("reports an error and keeps the dialog open when the request fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: false, status: 500 });
    const user = setupUser();
    const onClose = jest.fn();
    renderComponent({ onClose });

    await user.click(screen.getByLabelText("Select Weather lookup"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("reports an error when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const user = setupUser();
    const onClose = jest.fn();
    renderComponent({ onClose });

    await user.click(screen.getByLabelText("Select Weather lookup"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
