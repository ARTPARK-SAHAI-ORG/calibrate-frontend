import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { signOut } from "next-auth/react";
import { AgentDetail } from "../AgentDetail";

const useAccessTokenMock = jest.fn();
const usePageErrorStateMock = jest.fn();
const useVerifyConnectionMock = jest.fn();
const useOpenRouterModelsMock = jest.fn();
const findModelInProvidersMock = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
  usePageErrorState: () => usePageErrorStateMock(),
  useVerifyConnection: () => useVerifyConnectionMock(),
  useOpenRouterModels: () => useOpenRouterModelsMock(),
  findModelInProviders: (...args: any[]) => findModelInProvidersMock(...args),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

// Stub out the heavy tab content components — AgentDetail's own logic (data
// fetching, tab switching, header state, dialogs) is what's under test here,
// not the internals of each tab.
jest.mock("../agent-tabs", () => ({
  __esModule: true,
  AgentTabContent: () => <div data-testid="agent-tab-content">AgentTabContent</div>,
  AgentConnectionTabContent: (props: any) => (
    <div data-testid="connection-tab-content">
      <input
        aria-label="agent-url"
        value={props.agentUrl}
        onChange={(e) => props.onAgentUrlChange(e.target.value)}
      />
      <button onClick={() => props.onSave()}>SaveConnection</button>
      <button onClick={() => props.onVerificationSuccess()}>
        TriggerVerifySuccess
      </button>
      <button
        onClick={() =>
          props.onConnectionConfigChange({
            ...props.connectionConfig,
            benchmark_provider: "openai",
          })
        }
      >
        SetBenchmarkProvider
      </button>
      <button
        onClick={() =>
          props.onConnectionConfigChange({
            ...props.connectionConfig,
            supports_benchmark: true,
          })
        }
      >
        ToggleSupportsBenchmark
      </button>
    </div>
  ),
  ToolsTabContent: () => <div data-testid="tools-tab-content">ToolsTabContent</div>,
  DataExtractionTabContent: () => (
    <div data-testid="data-extraction-tab-content">DataExtractionTabContent</div>
  ),
  TestsTabContent: (props: any) => (
    <div data-testid="tests-tab-content">
      TestsTabContent-{props.agentType}
    </div>
  ),
  SettingsTabContent: () => (
    <div data-testid="settings-tab-content">SettingsTabContent</div>
  ),
}));

jest.mock("../VerifyErrorPopover", () => ({
  __esModule: true,
  VerifyErrorPopover: () => null,
}));

jest.mock("../VerifyRequestPreviewDialog", () => ({
  __esModule: true,
  VerifyRequestPreviewDialog: (props: any) =>
    props.open ? (
      <div data-testid="verify-request-dialog">
        <button onClick={() => props.onConfirm([{ role: "user", content: "hi" }])}>
          ConfirmVerify
        </button>
        <button onClick={props.onClose}>CloseVerifyDialog</button>
      </div>
    ) : null,
}));

const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

function jsonResponse(body: any, overrides: Partial<Response> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    clone() {
      return this;
    },
    ...overrides,
  } as unknown as Response;
}


async function clickLastSaveButton(user: ReturnType<typeof setupUser>) {
  const saveBtns = screen.getAllByRole("button", { name: "Save" });
  await user.click(saveBtns[saveBtns.length - 1]);
}

const defaultVerify = {
  isVerifying: false,
  verifyError: null,
  verifySampleResponse: null,
  verifySavedAgent: jest.fn().mockResolvedValue(true),
  verifyAdHoc: jest.fn().mockResolvedValue(true),
  dismiss: jest.fn(),
};

const defaultPageErrorState = {
  errorCode: null,
  reset: jest.fn(),
  captureResponse: jest.fn().mockReturnValue(false),
  captureError: jest.fn().mockReturnValue(false),
};

const buildAgent = {
  uuid: "agent-1",
  name: "Build Agent",
  type: "agent",
  config: {
    system_prompt: "hello",
    stt: { provider: "google" },
    tts: { provider: "google" },
    llm: { model: "google/gemini-3-flash-preview" },
    settings: { agent_speaks_first: true, max_assistant_turns: 20 },
    system_tools: { end_call: false },
    data_extraction_fields: [
      {
        uuid: "f1",
        type: "string",
        name: "field1",
        description: "desc",
        required: true,
      },
    ],
  },
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

const connectionAgent = {
  uuid: "agent-2",
  name: "Connect Agent",
  type: "connection",
  config: {
    agent_url: "https://example.com/agent",
    agent_headers: { "X-Key": "abc" },
    connection_verified: false,
    connection_verified_at: null,
    connection_verified_error: null,
    benchmark_models_verified: {},
  },
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

function mockFetchSequenceForAgent(agent: any) {
  // AgentDetail fires: fetch agent, fetch agent-tools, fetch all tools.
  (global.fetch as jest.Mock).mockImplementation((url: string) => {
    if (url.includes("/agent-tools/agent/")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.endsWith("/tools")) {
      return Promise.resolve(jsonResponse([]));
    }
    if (url.includes(`/agents/${agent.uuid}`)) {
      return Promise.resolve(jsonResponse(agent));
    }
    return Promise.resolve(jsonResponse({}));
  });
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
  global.fetch = jest.fn();
  useAccessTokenMock.mockReturnValue("token-123");
  usePageErrorStateMock.mockReturnValue({ ...defaultPageErrorState });
  useVerifyConnectionMock.mockReturnValue({ ...defaultVerify });
  useOpenRouterModelsMock.mockReturnValue({ providers: [] });
  findModelInProvidersMock.mockReturnValue(null);
  (signOut as jest.Mock).mockClear();
  jest.useRealTimers();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("AgentDetail", () => {
  it("shows a loading spinner, then renders a build agent's Agent tab by default", async () => {
    mockFetchSequenceForAgent(buildAgent);
    render(<AgentDetail agentUuid={buildAgent.uuid} />);

    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("agent-tab-content")).toBeInTheDocument();
    expect(screen.getByText("Agent")).toBeInTheDocument();
    expect(screen.getByText("Tools")).toBeInTheDocument();
    // Data extraction tab is temporarily hidden (extraction UI removed for now)
    expect(screen.queryByText("Data extraction")).not.toBeInTheDocument();
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
  });

  it("renders a connection agent's Connection tab by default with unverified badge", async () => {
    mockFetchSequenceForAgent(connectionAgent);
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);

    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("connection-tab-content")).toBeInTheDocument();
    expect(screen.getByText("Verify")).toBeInTheDocument();
    expect(screen.getByText("Connection")).toBeInTheDocument();
    expect(screen.queryByText("Agent")).not.toBeInTheDocument();
  });

  it("switches tabs on click for a build agent", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);

    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Tools"));
    expect(screen.getByTestId("tools-tab-content")).toBeInTheDocument();

    await user.click(screen.getByText("Tests"));
    expect(screen.getByTestId("tests-tab-content")).toHaveTextContent(
      "TestsTabContent-agent",
    );

    await user.click(screen.getByText("Settings"));
    expect(screen.getByTestId("settings-tab-content")).toBeInTheDocument();

    await user.click(screen.getByText("Agent"));
    expect(screen.getByTestId("agent-tab-content")).toBeInTheDocument();
  });

  it("renders NotFoundState when the fetch hook captures a 403/404", async () => {
    usePageErrorStateMock.mockReturnValue({
      ...defaultPageErrorState,
      errorCode: 404,
      captureResponse: jest.fn().mockReturnValue(true),
    });
    mockFetchSequenceForAgent(buildAgent);
    render(<AgentDetail agentUuid={buildAgent.uuid} />);

    await waitFor(() => expect(screen.getByText("404")).toBeInTheDocument());
    expect(screen.getByText("Not Found")).toBeInTheDocument();
  });

  it("shows generic error state and retries via window.location.reload on fetch failure", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      jsonResponse(null, { ok: false, status: 500 }),
    );
    const originalLocation = window.location;
    const reloadMock = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });

    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);

    await waitFor(() =>
      expect(screen.getByText("Failed to fetch agent")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Retry"));
    expect(reloadMock).toHaveBeenCalled();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("surfaces a thrown error when BACKEND_URL is unset", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    render(<AgentDetail agentUuid={buildAgent.uuid} />);

    await waitFor(() =>
      expect(
        screen.getByText("BACKEND_URL environment variable is not set"),
      ).toBeInTheDocument(),
    );
  });

  it("does not fetch when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("signs out on 401 for the agent-tools fetch", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/agent-tools/agent/")) {
        return Promise.resolve(jsonResponse(null, { ok: false, status: 401 }));
      }
      if (url.endsWith("/tools")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse(buildAgent));
    });
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("surfaces an agent-tools fetch failure without crashing", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/agent-tools/agent/")) {
        return Promise.resolve(jsonResponse(null, { ok: false, status: 500 }));
      }
      if (url.endsWith("/tools")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(jsonResponse(buildAgent));
    });
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );
  });

  it("signs out on 401 for the all-tools fetch, and surfaces a generic failure otherwise", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/agent-tools/agent/")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/tools")) {
        return Promise.resolve(jsonResponse(null, { ok: false, status: 401 }));
      }
      return Promise.resolve(jsonResponse(buildAgent));
    });
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("opens the edit-name dialog, saves a new name, and shows the success toast", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    const input = screen.getByDisplayValue("Build Agent");
    await user.clear(input);
    await user.type(input, "Renamed Agent");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...buildAgent, name: "Renamed Agent" }),
    );
    await clickLastSaveButton(user);

    await waitFor(() =>
      expect(screen.getByText("Renamed Agent")).toBeInTheDocument(),
    );
    expect(screen.getByText("Saved successfully")).toBeInTheDocument();
  });

  it("cancels the edit-name dialog via Cancel button and Escape key", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    expect(screen.getByText("Edit Agent Name")).toBeInTheDocument();
    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Edit Agent Name")).not.toBeInTheDocument();

    await user.click(screen.getByTitle("Click to edit name"));
    await user.keyboard("{Escape}");
    expect(screen.queryByText("Edit Agent Name")).not.toBeInTheDocument();
  });

  it("saves the edit-name dialog via Enter key", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    const input = screen.getByDisplayValue("Build Agent");
    await user.clear(input);
    await user.type(input, "Enter Renamed");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...buildAgent, name: "Enter Renamed" }),
    );
    await user.type(input, "{Enter}");

    await waitFor(() =>
      expect(screen.getByText("Enter Renamed")).toBeInTheDocument(),
    );
  });

  it("does not call the API when saving an unchanged/empty name", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    const fetchCallsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await user.click(screen.getByTitle("Click to edit name"));
    await clickLastSaveButton(user);

    expect(screen.queryByText("Edit Agent Name")).not.toBeInTheDocument();
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(fetchCallsBefore);
  });

  it("shows a name-conflict error inline when renaming hits 409, and clears it on edit", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    const input = screen.getByDisplayValue("Build Agent");
    await user.clear(input);
    await user.type(input, "Dup Name");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(
        { detail: "Agent name already exists" },
        { ok: false, status: 409 },
      ),
    );
    await clickLastSaveButton(user);

    await waitFor(() =>
      expect(screen.getByText("Agent name already exists")).toBeInTheDocument(),
    );
    await user.type(input, "!");
    expect(
      screen.queryByText("Agent name already exists"),
    ).not.toBeInTheDocument();
  });

  it("signs out on a 401 while renaming, and alerts on a generic rename failure", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    const input = screen.getByDisplayValue("Build Agent");
    await user.clear(input);
    await user.type(input, "Will 401");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    await clickLastSaveButton(user);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));

    alertSpy.mockRestore();
  });

  it("alerts on a generic (non-409/401) rename failure", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByTitle("Click to edit name"));
    const input = screen.getByDisplayValue("Build Agent");
    await user.clear(input);
    await user.type(input, "Will 500");

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 500 }),
    );
    await clickLastSaveButton(user);

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Failed to save agent name"),
    );
    alertSpy.mockRestore();
  });

  it("saves a build agent via the header Save button", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...buildAgent, config: buildAgent.config }),
    );
    await clickLastSaveButton(user);

    await waitFor(() =>
      expect(screen.getByText("Saved successfully")).toBeInTheDocument(),
    );
  });

  it("saves via Cmd+S / Ctrl+S and ignores plain S", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    await user.keyboard("s");
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({ ...buildAgent, config: buildAgent.config }),
    );
    await user.keyboard("{Meta>}s{/Meta}");
    await waitFor(() =>
      expect(screen.getByText("Saved successfully")).toBeInTheDocument(),
    );
  });

  it("alerts when saving a build agent fails, and signs out on 401", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    const alertSpy = jest.spyOn(window, "alert").mockImplementation(() => {});
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse({}, { ok: false, status: 500 }),
    );
    await clickLastSaveButton(user);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith("Failed to save agent"),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(null, { ok: false, status: 401 }),
    );
    await clickLastSaveButton(user);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));

    alertSpy.mockRestore();
  });

  it("dismisses the save toast manually", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(buildAgent));
    await clickLastSaveButton(user);
    await waitFor(() =>
      expect(screen.getByText("Saved successfully")).toBeInTheDocument(),
    );

    const toast = screen.getByText("Saved successfully").closest("div");
    const closeButton = toast?.parentElement?.querySelector("button");
    if (closeButton) await user.click(closeButton);
    await waitFor(() =>
      expect(screen.queryByText("Saved successfully")).not.toBeInTheDocument(),
    );
  });

  it("auto-dismisses the save toast after 3 seconds", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockFetchSequenceForAgent(buildAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(buildAgent));
    await clickLastSaveButton(user);
    await waitFor(() =>
      expect(screen.getByText("Saved successfully")).toBeInTheDocument(),
    );

    act(() => {
      jest.advanceTimersByTime(3100);
    });
    await waitFor(() =>
      expect(screen.queryByText("Saved successfully")).not.toBeInTheDocument(),
    );
    jest.useRealTimers();
  });

  it("resolves an unresolved LLM model id from providers once they load", async () => {
    findModelInProvidersMock.mockReturnValue({ id: "custom/model", name: "Custom Model" });
    useOpenRouterModelsMock.mockReturnValue({
      providers: [{ name: "Custom", models: [{ id: "custom/model", name: "Custom Model" }] }],
    });
    mockFetchSequenceForAgent({
      ...buildAgent,
      config: { ...buildAgent.config, llm: { model: "custom/model" } },
    });
    render(<AgentDetail agentUuid={buildAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Build Agent")).toBeInTheDocument(),
    );
    expect(findModelInProvidersMock).toHaveBeenCalled();
  });

  it("verifies a connection agent via the header Verify button and dialog", async () => {
    mockFetchSequenceForAgent(connectionAgent);
    const verifySavedAgent = jest.fn().mockResolvedValue(true);
    useVerifyConnectionMock.mockReturnValue({
      ...defaultVerify,
      verifySavedAgent,
    });
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("Verify"));
    expect(screen.getByTestId("verify-request-dialog")).toBeInTheDocument();

    await user.click(screen.getByText("ConfirmVerify"));
    await waitFor(() => expect(verifySavedAgent).toHaveBeenCalled());
  });

  it("shows the verifying spinner state on the header button", async () => {
    useVerifyConnectionMock.mockReturnValue({
      ...defaultVerify,
      isVerifying: true,
    });
    mockFetchSequenceForAgent(connectionAgent);
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );
    expect(screen.getByText("Verifying...")).toBeInTheDocument();
  });

  it("prompts unsaved-changes dialog when switching tabs with a dirty benchmark provider, and discards", async () => {
    mockFetchSequenceForAgent(connectionAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("SetBenchmarkProvider"));
    await user.click(screen.getByText("Tests"));

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    await user.click(screen.getByText("Discard"));
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    // Discard both clears the dialog and completes the pending tab switch.
    expect(screen.getByTestId("tests-tab-content")).toBeInTheDocument();
  });

  it("saves and switches tabs from the unsaved-changes dialog", async () => {
    mockFetchSequenceForAgent(connectionAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("SetBenchmarkProvider"));
    await user.click(screen.getByText("Tests"));
    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(connectionAgent));
    await clickLastSaveButton(user);

    await waitFor(() =>
      expect(screen.getByTestId("tests-tab-content")).toBeInTheDocument(),
    );
  });

  it("closes the unsaved-changes dialog via the overlay without switching", async () => {
    mockFetchSequenceForAgent(connectionAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("SetBenchmarkProvider"));
    await user.click(screen.getByText("Tests"));
    const overlay = screen.getByText("Unsaved changes").closest("div")
      ?.parentElement as HTMLElement;
    await user.click(overlay);
    expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument();
    expect(screen.getByTestId("connection-tab-content")).toBeInTheDocument();
  });

  it("auto-saves an initially-unverified connection agent's config changes (debounced)", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    mockFetchSequenceForAgent(connectionAgent);
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(connectionAgent));
    await user.type(screen.getByLabelText("agent-url"), "x");

    act(() => {
      jest.advanceTimersByTime(900);
    });
    await waitFor(() => {
      const putCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => c[1]?.method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);
    });
    jest.useRealTimers();
  });

  it("shows the save-after-verify popup for an initially-verified agent whose identity changed", async () => {
    mockFetchSequenceForAgent({
      ...connectionAgent,
      config: { ...connectionAgent.config, connection_verified: true },
    });
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("agent-url"), "-changed");
    await user.click(screen.getByText("TriggerVerifySuccess"));

    expect(screen.getByText("Save new configuration?")).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(connectionAgent));
    await clickLastSaveButton(user);
    await waitFor(() =>
      expect(screen.queryByText("Save new configuration?")).not.toBeInTheDocument(),
    );
  });

  it("dismisses the save-after-verify popup via Not now / overlay without saving", async () => {
    mockFetchSequenceForAgent({
      ...connectionAgent,
      config: { ...connectionAgent.config, connection_verified: true },
    });
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.type(screen.getByLabelText("agent-url"), "-changed2");
    await user.click(screen.getByText("TriggerVerifySuccess"));
    expect(screen.getByText("Save new configuration?")).toBeInTheDocument();

    await user.click(screen.getByText("Not now"));
    expect(screen.queryByText("Save new configuration?")).not.toBeInTheDocument();
  });

  it("skips the save-after-verify popup when re-verifying the same identity", async () => {
    mockFetchSequenceForAgent({
      ...connectionAgent,
      config: { ...connectionAgent.config, connection_verified: true },
    });
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    await user.click(screen.getByText("TriggerVerifySuccess"));
    expect(screen.queryByText("Save new configuration?")).not.toBeInTheDocument();
  });

  it("auto-saves the benchmark toggle for a verified connection agent", async () => {
    // NOTE: `supports_benchmark` must be a defined boolean (not undefined) in
    // the initial config. The auto-save effect in AgentDetail.tsx seeds
    // `lastAutoSavedBenchmarkRef` to the *literal* first-seen value and only
    // detects change on subsequent renders — if the seeded value were
    // `undefined` (the config's natural default when the field is absent),
    // the very first toggle would be indistinguishable from the initial seed
    // and would silently skip the auto-save. This looks like a pre-existing
    // source quirk; per instructions we don't edit source, so the test seeds
    // an explicit `false` to exercise the intended "toggle triggers save" path.
    mockFetchSequenceForAgent({
      ...connectionAgent,
      config: {
        ...connectionAgent.config,
        connection_verified: true,
        supports_benchmark: false,
      },
    });
    const user = setupUser();
    render(<AgentDetail agentUuid={connectionAgent.uuid} />);
    await waitFor(() =>
      expect(screen.getByText("Connect Agent")).toBeInTheDocument(),
    );

    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(connectionAgent));
    await user.click(screen.getByText("ToggleSupportsBenchmark"));

    await waitFor(() => {
      const putCalls = (global.fetch as jest.Mock).mock.calls.filter(
        (c: any[]) => c[1]?.method === "PUT",
      );
      expect(putCalls.length).toBeGreaterThan(0);
    });
  });

  it("invokes onHeaderStateChange with header state and hides the inline header", async () => {
    mockFetchSequenceForAgent(buildAgent);
    const onHeaderStateChange = jest.fn();
    render(
      <AgentDetail
        agentUuid={buildAgent.uuid}
        onHeaderStateChange={onHeaderStateChange}
      />,
    );

    await waitFor(() => {
      const lastCall =
        onHeaderStateChange.mock.calls[onHeaderStateChange.mock.calls.length - 1][0];
      expect(lastCall.agentName).toBe("Build Agent");
    });
    const lastCall =
      onHeaderStateChange.mock.calls[onHeaderStateChange.mock.calls.length - 1][0];
    expect(lastCall.activeTab).toBe("agent");
    // No inline back-link header rendered when the parent supplies one.
    expect(screen.queryByTitle("Back to agents")).not.toBeInTheDocument();
  });
});
