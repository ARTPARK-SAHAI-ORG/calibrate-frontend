import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { signOut } from "next-auth/react";
import { AddToolDialog } from "../AddToolDialog";

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
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
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
    expect(screen.getByText("Weather lookup")).toBeInTheDocument();
    expect(screen.getByText("Calendar booking")).toBeInTheDocument();
    expect(screen.queryByText("Already added tool")).not.toBeInTheDocument();
  });

  it("shows description fallback from config.description", () => {
    renderComponent();
    expect(screen.getByText("Books calendar events")).toBeInTheDocument();
  });

  it("shows empty state when all tools are already added", () => {
    renderComponent({ allTools: [alreadyAdded], agentTools: [alreadyAdded] });
    expect(
      screen.getByText("All available tools have been added to this agent")
    ).toBeInTheDocument();
  });

  it("filters tools by search query on name", async () => {
    const user = setupUser();
    renderComponent();

    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    expect(screen.getByText("Weather lookup")).toBeInTheDocument();
    expect(screen.queryByText("Calendar booking")).not.toBeInTheDocument();
  });

  it("filters tools by search query on description", async () => {
    const user = setupUser();
    renderComponent();

    await user.type(screen.getByPlaceholderText("Search tools"), "calendar events");
    expect(screen.getByText("Calendar booking")).toBeInTheDocument();
    expect(screen.queryByText("Weather lookup")).not.toBeInTheDocument();
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

  it("selects and deselects tools, updating the Add button count", async () => {
    const user = setupUser();
    renderComponent();

    await user.click(screen.getByText("Weather lookup"));
    expect(screen.getByText("Add (1)")).toBeInTheDocument();

    await user.click(screen.getByText("Calendar booking"));
    expect(screen.getByText("Add (2)")).toBeInTheDocument();

    // Deselect
    await user.click(screen.getByText("Weather lookup"));
    expect(screen.getByText("Add (1)")).toBeInTheDocument();
  });

  it("closes and resets state via the header close (X) button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderComponent({ onClose });

    await user.type(screen.getByPlaceholderText("Search tools"), "weather");
    await user.click(screen.getByText("Weather lookup"));

    const closeButton = screen.getAllByRole("button")[0];
    await user.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via backdrop click", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = renderComponent({ onClose });

    const backdrop = container.querySelector(".absolute.inset-0.-z-10") as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("adds selected tools successfully", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, status: 200 });
    const user = setupUser();
    const onToolsAdded = jest.fn();
    const onClose = jest.fn();
    renderComponent({ onToolsAdded, onClose });

    await user.click(screen.getByText("Weather lookup"));
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

    await user.click(screen.getByText("Weather lookup"));
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

    await user.click(screen.getByText("Weather lookup"));
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

    await user.click(screen.getByText("Weather lookup"));
    await user.click(screen.getByText("Add (1)"));

    await waitFor(() => {
      expect(global.fetch).not.toHaveBeenCalled();
    });
    expect(onClose).not.toHaveBeenCalled();
  });
});
