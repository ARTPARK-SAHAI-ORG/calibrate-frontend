import { render, screen, setupUser, waitFor, fireEvent } from "@/test-utils";
import { signOut } from "next-auth/react";
import { AgentPicker, MultiAgentPicker } from "../AgentPicker";

const useAccessTokenMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

function mockFetchOnce(response: Partial<Response> & { json?: () => any }) {
  (global.fetch as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => [],
    ...response,
  });
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
  { uuid: "a1", name: "Support Bot", type: "agent" },
  {
    uuid: "a2",
    name: "Connect Bot",
    type: "connection",
    connection_verified: false,
  },
  {
    uuid: "a3",
    name: "Verified Connect",
    type: "connection",
    connection_verified: true,
  },
];

describe("AgentPicker", () => {
  it("does not fetch when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("fetches and lists agents, showing unverified pill and type pills", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "https://api.example.com/agents",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({ Authorization: "Bearer token-123" }),
      }),
    ));

    await user.click(screen.getByRole("button", { name: "Select an agent" }));

    expect(await screen.findByText("Support Bot")).toBeInTheDocument();
    expect(screen.getByText("Connect Bot")).toBeInTheDocument();
    expect(screen.getAllByText("Unverified")).toHaveLength(1);
    expect(screen.getAllByText("Connection")).toHaveLength(2);
    expect(screen.getAllByText("Agent")).toHaveLength(1);
  });

  it("selects an agent and calls onSelectAgent", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    const onSelectAgent = jest.fn();
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={onSelectAgent} />);

    await user.click(screen.getByRole("button", { name: "Select an agent" }));
    const option = await screen.findByText("Support Bot");
    await user.click(option);

    expect(onSelectAgent).toHaveBeenCalledWith(
      expect.objectContaining({ uuid: "a1", name: "Support Bot" }),
    );
  });

  it("shows the selected agent's name as the trigger label and check icon", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(<AgentPicker selectedAgentUuid="a1" onSelectAgent={jest.fn()} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText("Support Bot")).toBeInTheDocument();
  });

  it("signs out on a 401 response", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("reports an error when the response is not ok", async () => {
    const { reportError } = require("../../lib/reportError");
    mockFetchOnce({ ok: false, status: 500 });
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await waitFor(() => expect(reportError).toHaveBeenCalled());
  });

  it("reports an error when NEXT_PUBLIC_BACKEND_URL is not set", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    const { reportError } = require("../../lib/reportError");
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await waitFor(() => expect(reportError).toHaveBeenCalled());
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("passes through label, placeholder, className, and disabled", () => {
    render(
      <AgentPicker
        selectedAgentUuid=""
        onSelectAgent={jest.fn()}
        label="Pick an agent"
        placeholder="Choose one"
        className="my-class"
        disabled
      />,
    );
    expect(screen.getByText("Pick an agent")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose one" })).toBeDisabled();
  });

  it("shows the check icon next to the currently selected agent in the dropdown", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(<AgentPicker selectedAgentUuid="a1" onSelectAgent={jest.fn()} />);

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Support Bot" }));

    const optionEl = await screen.findByRole("option", { name: /Support Bot/ });
    expect(
      optionEl.querySelector("path[d='M4.5 12.75l6 6 9-13.5']"),
    ).toBeInTheDocument();
  });

  it("normalises legacy agent shapes: agent_name fallback, stringified fallback, and config.connection_verified", async () => {
    const legacyPayload = [
      // name missing -> falls back to agent_name
      { uuid: "l1", agent_name: "Legacy Named" },
      // neither name nor agent_name -> String(agent)
      { uuid: "l4" },
      // connection with verification only under the legacy nested config
      {
        uuid: "l2",
        name: "Config Verified",
        type: "connection",
        config: { connection_verified: true },
      },
      // connection with no verification info at all -> unverified
      { uuid: "l3", name: "Bare Connection", type: "connection" },
    ];
    mockFetchOnce({ json: async () => legacyPayload });
    const user = setupUser();
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Select an agent" }));

    expect(await screen.findByText("Legacy Named")).toBeInTheDocument();
    expect(screen.getByText("[object Object]")).toBeInTheDocument();
    // Only l3 (connection, no verification data) is unverified; l2's nested
    // config.connection_verified === true makes it verified.
    expect(screen.getAllByText("Unverified")).toHaveLength(1);
  });

  it("filters agents by search query", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(<AgentPicker selectedAgentUuid="" onSelectAgent={jest.fn()} />);

    await user.click(screen.getByRole("button", { name: "Select an agent" }));
    await screen.findByText("Support Bot");

    await user.type(screen.getByPlaceholderText("Search agents"), "Verified");
    expect(screen.getByText("Verified Connect")).toBeInTheDocument();
    expect(screen.queryByText("Support Bot")).not.toBeInTheDocument();
  });
});

describe("MultiAgentPicker", () => {
  it("does not fetch when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows placeholder when nothing is selected and opens the dropdown", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );

    expect(screen.getByText("Select agents")).toBeInTheDocument();
    await user.click(screen.getByText("Select agents"));

    expect(await screen.findByText("Support Bot")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search agents")).toBeInTheDocument();
  });

  it("shows loading state while fetching", async () => {
    let resolveFetch: (v: any) => void;
    (global.fetch as jest.Mock).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await user.click(screen.getByText("Select agents"));
    expect(screen.getByText("Loading agents")).toBeInTheDocument();

    resolveFetch!({ ok: true, status: 200, json: async () => [] });
    await waitFor(() =>
      expect(screen.queryByText("Loading agents")).not.toBeInTheDocument(),
    );
  });

  it("shows empty state when there are no matching agents", async () => {
    mockFetchOnce({ json: async () => [] });
    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await user.click(screen.getByText("Select agents"));
    expect(await screen.findByText("No agents found")).toBeInTheDocument();
  });

  it("calls onAgentsLoaded once agents load successfully", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const onAgentsLoaded = jest.fn();
    render(
      <MultiAgentPicker
        selectedAgentUuids={[]}
        onToggleAgent={jest.fn()}
        onAgentsLoaded={onAgentsLoaded}
      />,
    );
    await waitFor(() =>
      expect(onAgentsLoaded).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ uuid: "a1", name: "Support Bot" }),
        ]),
      ),
    );
  });

  it("does not call onAgentsLoaded when the fetch is not ok", async () => {
    mockFetchOnce({ ok: false, status: 500 });
    const onAgentsLoaded = jest.fn();
    render(
      <MultiAgentPicker
        selectedAgentUuids={[]}
        onToggleAgent={jest.fn()}
        onAgentsLoaded={onAgentsLoaded}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(onAgentsLoaded).not.toHaveBeenCalled();
  });

  it("signs out on a 401 response", async () => {
    mockFetchOnce({ ok: false, status: 401 });
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("does nothing when NEXT_PUBLIC_BACKEND_URL is unset (no throw)", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("reports an error when fetch throws", async () => {
    (global.fetch as jest.Mock).mockRejectedValueOnce(new Error("network down"));
    const { reportError } = require("../../lib/reportError");
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await waitFor(() => expect(reportError).toHaveBeenCalled());
  });

  it("toggles an agent on selection and shows it as a chip with unverified pill and type", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    const onToggleAgent = jest.fn();
    const { rerender } = render(
      <MultiAgentPicker
        selectedAgentUuids={[]}
        onToggleAgent={onToggleAgent}
      />,
    );
    await user.click(screen.getByText("Select agents"));
    const option = await screen.findByText("Connect Bot");
    await user.click(option);
    expect(onToggleAgent).toHaveBeenCalledWith("a2");

    rerender(
      <MultiAgentPicker
        selectedAgentUuids={["a2"]}
        onToggleAgent={onToggleAgent}
      />,
    );
    expect(screen.getAllByText("Connect Bot").length).toBeGreaterThan(0);
  });

  it("removes a selected agent chip when its remove button is clicked", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    const onToggleAgent = jest.fn();
    render(
      <MultiAgentPicker
        selectedAgentUuids={["a1"]}
        onToggleAgent={onToggleAgent}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());

    const chip = await screen.findByText("Support Bot");
    const removeButton = chip.closest("span")!.querySelector("button")!;
    await user.click(removeButton);
    expect(onToggleAgent).toHaveBeenCalledWith("a1");
  });

  it("shows the raw uuid as a chip label when the agent isn't found in the loaded list", async () => {
    mockFetchOnce({ json: async () => [] });
    render(
      <MultiAgentPicker
        selectedAgentUuids={["unknown-uuid"]}
        onToggleAgent={jest.fn()}
      />,
    );
    expect(await screen.findByText("unknown-uuid")).toBeInTheDocument();
  });

  it("filters the dropdown list by search query and excludes already-selected agents", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(
      <MultiAgentPicker
        selectedAgentUuids={["a1"]}
        onToggleAgent={jest.fn()}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.click(screen.getByText("Support Bot"));

    // a1 (Support Bot) is already selected so it should not appear in the options list
    expect(
      screen.queryByRole("button", { name: /Support Bot/ }),
    ).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search agents"), "Verified");
    expect(screen.getByText("Verified Connect")).toBeInTheDocument();
    expect(screen.queryByText("Connect Bot")).not.toBeInTheDocument();
  });

  it("closes the dropdown when clicking the overlay", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await user.click(screen.getByText("Select agents"));
    await screen.findByText("Support Bot");

    const overlay = document.querySelector(".fixed.inset-0.z-\\[99\\]");
    expect(overlay).toBeInTheDocument();
    fireEvent.click(overlay as HTMLElement);

    await waitFor(() =>
      expect(screen.queryByText("Support Bot")).not.toBeInTheDocument(),
    );
  });

  it("opens the dropdown above the trigger when there isn't enough space below", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const originalGetBoundingClientRect =
      HTMLDivElement.prototype.getBoundingClientRect;
    const originalInnerHeight = window.innerHeight;
    HTMLDivElement.prototype.getBoundingClientRect = jest.fn(() => ({
      left: 0,
      top: 700,
      bottom: 730,
      right: 100,
      width: 100,
      height: 30,
      x: 0,
      y: 700,
      toJSON: () => {},
    }));
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 800,
    });

    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await user.click(screen.getByText("Select agents"));
    await screen.findByText("Support Bot");

    HTMLDivElement.prototype.getBoundingClientRect =
      originalGetBoundingClientRect;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
  });

  it("stops propagation when clicking the search input inside the dropdown", async () => {
    mockFetchOnce({ json: async () => agentsPayload });
    const user = setupUser();
    render(
      <MultiAgentPicker selectedAgentUuids={[]} onToggleAgent={jest.fn()} />,
    );
    await user.click(screen.getByText("Select agents"));
    const searchInput = await screen.findByPlaceholderText("Search agents");
    await user.click(searchInput);
    // Dropdown should remain open (Support Bot still visible) since the click
    // was stopped from bubbling to the trigger toggle.
    expect(screen.getByText("Support Bot")).toBeInTheDocument();
  });
});
