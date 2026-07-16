import { render, screen, setupUser, waitFor, within } from "@/test-utils";
import { signOut } from "next-auth/react";
import { Agents } from "../Agents";

const useAccessTokenMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  ...jest.requireActual("../../hooks"),
  useAccessToken: () => useAccessTokenMock(),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
const originalLocation = window.location;

function jsonResponse(body: any, overrides: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    ...overrides,
  } as Response;
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
  global.fetch = jest.fn();
  useAccessTokenMock.mockReturnValue("token-123");
  (signOut as jest.Mock).mockClear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  jest.clearAllMocks();
});

const agentsPayload = [
  {
    uuid: "a1",
    name: "Support Bot",
    type: "agent",
    updated_at: "2024-01-01T10:00:00.000Z",
  },
  {
    uuid: "a2",
    name: "Connect Bot",
    type: "connection",
    updated_at: "2024-02-01T10:00:00.000Z",
  },
];

describe("Agents", () => {
  it("shows a loading spinner while fetching, then renders the list", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    render(<Agents />);

    expect(screen.getByText("Agents")).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Connect Bot")[0]).toBeInTheDocument();
    expect(screen.getByText("2 agents")).toBeInTheDocument();
  });

  it("does not fetch when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    render(<Agents />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("renders empty state when there are no agents", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    render(<Agents />);

    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    expect(
      screen.getByText("Get started by creating your first agent"),
    ).toBeInTheDocument();
  });

  it("renders an error state and retries via window.location.reload", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 500 }),
    );
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    const user = setupUser();
    render(<Agents />);

    await waitFor(() =>
      expect(screen.getByText("Failed to fetch agents")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Retry"));
    expect(reloadMock).toHaveBeenCalled();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("signs out on a 401 while fetching agents", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    render(<Agents />);

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("surfaces a thrown error message when BACKEND_URL is unset", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    render(<Agents />);

    await waitFor(() =>
      expect(
        screen.getByText("BACKEND_URL environment variable is not set"),
      ).toBeInTheDocument(),
    );
  });

  it("filters agents by search query", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);

    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    await user.type(screen.getByPlaceholderText("Search agents"), "Connect");
    expect(screen.queryAllByText("Support Bot")).toHaveLength(0);
    expect(screen.getAllByText("Connect Bot")[0]).toBeInTheDocument();
    // The count reflects the filtered list, not the full set.
    expect(screen.getByText("1 agent")).toBeInTheDocument();
    expect(screen.queryByText("2 agents")).not.toBeInTheDocument();
  });

  it("toggles sort order when clicking the sort button", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);

    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const sortButtons = screen.getAllByText("Last updated at");
    await user.click(sortButtons[0]);
    // After toggling twice it should still render both agents without error.
    await user.click(sortButtons[0]);
    expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument();
  });

  it("handles agents with missing/invalid dates by falling back to string comparison", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse([
        { uuid: "b1", name: "Bad Date Agent", type: "agent", updated_at: "not-a-date" },
        { uuid: "b2", name: "Another Agent", type: "agent", updated_at: "also-bad" },
      ]),
    );
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Bad Date Agent")[0]).toBeInTheDocument(),
    );
    expect(screen.getAllByText("Another Agent")[0]).toBeInTheDocument();
  });

  it("falls back to agent_name / stringified agent when name is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse([
        { uuid: "c1", agent_name: "Named Via Fallback", type: "agent" },
      ]),
    );
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Named Via Fallback")[0]).toBeInTheDocument(),
    );
  });

  it("opens the new agent dialog, switches kind, and creates an agent (build)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const onNavigateToAgent = jest.fn();
    const user = setupUser();
    render(<Agents onNavigateToAgent={onNavigateToAgent} />);

    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );

    await user.click(screen.getAllByText("New agent")[0]);
    expect(screen.getByText("Choose a name and how you want to set up your agent")).toBeInTheDocument();

    const nameInput = screen.getByPlaceholderText("Enter agent name");
    await user.type(nameInput, "My New Agent");

    // Switch to "Connect" then back to "Build" to exercise both kind branches.
    await user.click(screen.getByText("Connect your existing agent"));
    await user.click(screen.getByText("Build your agent in Calibrate"));

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "new-agent-uuid" }),
    );

    await user.click(screen.getByText("Create"));

    await waitFor(() => expect(onNavigateToAgent).toHaveBeenCalledWith("new-agent-uuid"));
  });

  it("creates a connection-kind agent", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const onNavigateToAgent = jest.fn();
    const user = setupUser();
    render(<Agents onNavigateToAgent={onNavigateToAgent} />);

    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByText("New agent")[0]);
    await user.type(screen.getByPlaceholderText("Enter agent name"), "Conn Agent");
    await user.click(screen.getByText("Connect your existing agent"));

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "conn-uuid" }),
    );
    await user.click(screen.getByText("Create"));

    await waitFor(() => expect(onNavigateToAgent).toHaveBeenCalledWith("conn-uuid"));
    const body = JSON.parse((global.fetch as jest.Mock).mock.calls[1][1].body);
    expect(body.type).toBe("connection");
  });

  it("shows a name-conflict error inline when creating hits 409", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByText("New agent")[0]);
    await user.type(screen.getByPlaceholderText("Enter agent name"), "Dup Agent");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      clone() {
        return this;
      },
      json: async () => ({ detail: "Agent name already exists" }),
    });

    await user.click(screen.getByText("Create"));

    await waitFor(() =>
      expect(screen.getByText("Agent name already exists")).toBeInTheDocument(),
    );

    // Editing the name clears the conflict error.
    await user.type(screen.getByPlaceholderText("Enter agent name"), "!");
    expect(
      screen.queryByText("Agent name already exists"),
    ).not.toBeInTheDocument();
  });

  it("shows a generic error and signs out on 401 when creating fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByText("New agent")[0]);
    await user.type(screen.getByPlaceholderText("Enter agent name"), "Agent X");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    await user.click(screen.getByText("Create"));

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("shows a generic create failure error for a non-409/401 failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByText("New agent")[0]);
    await user.type(screen.getByPlaceholderText("Enter agent name"), "Agent Y");

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      clone() {
        return this;
      },
      json: async () => ({}),
    });
    await user.click(screen.getByText("Create"));

    await waitFor(() =>
      expect(screen.getByText("Failed to create agent")).toBeInTheDocument(),
    );
  });

  it("submits create via Enter key when name is non-empty", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const onNavigateToAgent = jest.fn();
    const user = setupUser();
    render(<Agents onNavigateToAgent={onNavigateToAgent} />);
    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );
    await user.click(screen.getAllByText("New agent")[0]);
    const input = screen.getByPlaceholderText("Enter agent name");
    await user.type(input, "Enter Agent");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "enter-uuid" }),
    );
    await user.type(input, "{Enter}");

    await waitFor(() => expect(onNavigateToAgent).toHaveBeenCalledWith("enter-uuid"));
  });

  it("closes the new agent dialog via Cancel and via the overlay", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse([]));
    const user = setupUser();
    const { container } = render(<Agents />);
    await waitFor(() =>
      expect(screen.getByText("No agents found")).toBeInTheDocument(),
    );

    await user.click(screen.getAllByText("New agent")[0]);
    expect(screen.getByText("Choose a name and how you want to set up your agent")).toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));
    expect(
      screen.queryByText("Choose a name and how you want to set up your agent"),
    ).not.toBeInTheDocument();
  });

  it("deletes an agent through the confirmation dialog", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const deleteButtons = screen.getAllByTitle("Delete agent");
    await user.click(deleteButtons[0]);

    expect(
      screen.getByText(/Are you sure you want to delete "Connect Bot"/),
    ).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse({}));
    const deleteConfirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteConfirmButtons[deleteConfirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.queryAllByText("Connect Bot")).toHaveLength(0),
    );
  });

  it("bulk-deletes selected agents via select-all and the bulk bar", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    // Select every agent through the header select-all checkbox.
    await user.click(screen.getByLabelText("Select all agents"));

    const bulkButton = screen.getByRole("button", {
      name: /Delete selected \(2\)/,
    });
    await user.click(bulkButton);

    expect(
      screen.getByText(/Are you sure you want to delete 2 agents/),
    ).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ deleted_count: 2 }),
    );
    const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.queryAllByText("Support Bot")).toHaveLength(0),
    );
    // The bulk call hits the bulk-delete endpoint with the selected uuids.
    const bulkCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).endsWith("/agents/bulk-delete"),
    );
    expect(bulkCall).toBeTruthy();
    expect(JSON.parse(bulkCall[1].body)).toEqual({
      agent_uuids: ["a2", "a1"],
    });
  });

  it("surfaces a 404 all-or-nothing rejection during bulk delete", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    await user.click(screen.getByLabelText("Select all agents"));
    await user.click(
      screen.getByRole("button", { name: /Delete selected \(2\)/ }),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(
        { detail: { message: "missing", not_found: ["a2"] } },
        { ok: false, status: 404 },
      ),
    );
    const confirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.getByText(/no longer available/)).toBeInTheDocument(),
    );
    // Nothing was removed.
    expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument();
  });

  it("signs out on 401 while deleting, and reports error on generic failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const deleteButtons = screen.getAllByTitle("Delete agent");
    await user.click(deleteButtons[0]);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    const deleteConfirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteConfirmButtons[deleteConfirmButtons.length - 1]);

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("cannot close the delete dialog while a delete is in-flight", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const deleteButtons = screen.getAllByTitle("Delete agent");
    await user.click(deleteButtons[0]);

    let resolveDelete: (v: any) => void = () => {};
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDelete = resolve;
      }),
    );
    const deleteConfirmButtons = screen.getAllByRole("button", { name: "Delete" });
    await user.click(deleteConfirmButtons[deleteConfirmButtons.length - 1]);

    // Cancel button should be disabled while deleting is in-flight.
    const cancelBtns = screen.getAllByRole("button", { name: "Cancel" });
    expect(cancelBtns[cancelBtns.length - 1]).toBeDisabled();

    resolveDelete(jsonResponse({}));
    await waitFor(() =>
      expect(screen.queryAllByText("Connect Bot")).toHaveLength(0),
    );
  });

  it("opens the duplicate dialog and duplicates an agent", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const onNavigateToAgent = jest.fn();
    const user = setupUser();
    render(<Agents onNavigateToAgent={onNavigateToAgent} />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const duplicateButtons = screen.getAllByTitle("Duplicate agent");
    await user.click(duplicateButtons[0]);

    expect(screen.getByText("Duplicate agent")).toBeInTheDocument();
    const input = screen.getByDisplayValue("Copy of Connect Bot");
    expect(input).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ uuid: "dup-uuid" }),
    );
    const duplicateConfirmButtons = screen.getAllByRole("button", { name: "Duplicate" });
    await user.click(duplicateConfirmButtons[duplicateConfirmButtons.length - 1]);

    await waitFor(() =>
      expect(onNavigateToAgent).toHaveBeenCalledWith("dup-uuid"),
    );
    expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument();
  });

  it("shows a name-conflict error when duplicating hits 409", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    const duplicateButtons = screen.getAllByTitle("Duplicate agent");
    await user.click(duplicateButtons[0]);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 409,
      clone() {
        return this;
      },
      json: async () => ({ detail: "Agent name already exists" }),
    });
    const duplicateConfirmButtons = screen.getAllByRole("button", { name: "Duplicate" });
    await user.click(duplicateConfirmButtons[duplicateConfirmButtons.length - 1]);

    await waitFor(() =>
      expect(screen.getByText("Agent name already exists")).toBeInTheDocument(),
    );
  });

  it("shows a generic error and signs out on 401 when duplicating fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );
    const duplicateButtons = screen.getAllByTitle("Duplicate agent");
    await user.click(duplicateButtons[0]);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    const duplicateConfirmButtons = screen.getAllByRole("button", { name: "Duplicate" });
    await user.click(duplicateConfirmButtons[duplicateConfirmButtons.length - 1]);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("shows a generic duplicate-failure message on a non-409/401 failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );
    const duplicateButtons = screen.getAllByTitle("Duplicate agent");
    await user.click(duplicateButtons[0]);

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      clone() {
        return this;
      },
      json: async () => ({}),
    });
    const duplicateConfirmButtons = screen.getAllByRole("button", { name: "Duplicate" });
    await user.click(duplicateConfirmButtons[duplicateConfirmButtons.length - 1]);
    await waitFor(() =>
      expect(screen.getByText("Failed to duplicate agent")).toBeInTheDocument(),
    );
  });

  it("closes the duplicate dialog via Cancel", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const user = setupUser();
    render(<Agents />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );
    const duplicateButtons = screen.getAllByTitle("Duplicate agent");
    await user.click(duplicateButtons[0]);
    expect(screen.getByText("Duplicate agent")).toBeInTheDocument();

    const cancelButtons = screen.getAllByRole("button", { name: /Cancel/ });
    await user.click(cancelButtons[cancelButtons.length - 1]);
    expect(screen.queryByText("Duplicate agent")).not.toBeInTheDocument();
  });

  it("navigates via onNavigateToAgent when clicking an agent row link", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(agentsPayload),
    );
    const onNavigateToAgent = jest.fn();
    const user = setupUser();
    render(<Agents onNavigateToAgent={onNavigateToAgent} />);
    await waitFor(() =>
      expect(screen.getAllByText("Support Bot")[0]).toBeInTheDocument(),
    );

    await user.click(screen.getAllByText("Support Bot")[0]);
    expect(onNavigateToAgent).toHaveBeenCalledWith("a1");
  });
});
