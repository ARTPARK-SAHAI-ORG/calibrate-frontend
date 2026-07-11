import React from "react";
import { render, screen, setupUser, fireEvent, waitFor } from "@/test-utils";
import {
  AgentConnectionTabContent,
  type ConnectionConfig,
} from "../AgentConnectionTabContent";

const verifyAdHoc = jest.fn();
const dismiss = jest.fn();
let hookState: {
  isVerifying: boolean;
  verifyError: string | null;
  verifySampleResponse: Record<string, unknown> | null;
} = {
  isVerifying: false,
  verifyError: null,
  verifySampleResponse: null,
};

jest.mock("../../../hooks", () => ({
  useVerifyConnection: () => ({
    isVerifying: hookState.isVerifying,
    verifyError: hookState.verifyError,
    verifySampleResponse: hookState.verifySampleResponse,
    verifyAdHoc,
    verifySavedAgent: jest.fn(),
    dismiss,
  }),
}));

jest.mock("../../VerifyRequestPreviewDialog", () => ({
  VerifyRequestPreviewDialog: ({
    open,
    onClose,
    onConfirm,
    isVerifying,
  }: any) =>
    open ? (
      <div data-testid="verify-dialog">
        <span>{isVerifying ? "verifying" : "idle"}</span>
        <button onClick={() => onConfirm([{ role: "user", content: "Hi" }])}>
          Confirm verify
        </button>
        <button onClick={onClose}>Close dialog</button>
      </div>
    ) : null,
}));

function makeConfig(overrides: Partial<ConnectionConfig> = {}): ConnectionConfig {
  return {
    agent_url: "",
    agent_headers: {},
    connection_verified: false,
    connection_verified_at: null,
    connection_verified_error: null,
    supports_benchmark: false,
    benchmark_provider: "openrouter",
    ...overrides,
  };
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof AgentConnectionTabContent>> = {}
) {
  const onAgentUrlChange = jest.fn();
  const onAgentHeadersChange = jest.fn();
  const onConnectionConfigChange = jest.fn();
  const onSave = jest.fn();
  const onVerificationSuccess = jest.fn();

  const props: React.ComponentProps<typeof AgentConnectionTabContent> = {
    agentUuid: "agent-1",
    agentUrl: "",
    onAgentUrlChange,
    agentHeaders: [],
    onAgentHeadersChange,
    connectionConfig: makeConfig(),
    onConnectionConfigChange,
    onSave,
    isSaving: false,
    onVerificationSuccess,
    ...overrides,
  };

  const utils = render(<AgentConnectionTabContent {...props} />);
  return {
    ...utils,
    onAgentUrlChange,
    onAgentHeadersChange,
    onConnectionConfigChange,
    onSave,
    onVerificationSuccess,
    props,
  };
}

describe("AgentConnectionTabContent", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    hookState = {
      isVerifying: false,
      verifyError: null,
      verifySampleResponse: null,
    };
  });

  it("renders the unverified state with the verify button disabled for an empty URL", () => {
    renderComponent();
    expect(screen.getByText("Not verified")).toBeInTheDocument();
    const verifyButton = screen.getByText("Verify").closest("button");
    expect(verifyButton).toBeDisabled();
  });

  it("enables the verify button once a URL is entered", () => {
    renderComponent({ agentUrl: "https://example.com" });
    const verifyButton = screen.getByText("Verify").closest("button");
    expect(verifyButton).not.toBeDisabled();
  });

  it("disables the verify button while saving", () => {
    renderComponent({ agentUrl: "https://example.com", isSaving: true });
    const verifyButton = screen.getByText("Verify").closest("button");
    expect(verifyButton).toBeDisabled();
  });

  it("shows verified status with formatted timestamp when initially verified", () => {
    renderComponent({
      agentUrl: "https://example.com",
      connectionConfig: makeConfig({
        connection_verified: true,
        connection_verified_at: "2024-01-15T10:30:00Z",
        agent_url: "https://example.com",
      }),
    });
    expect(screen.getByText("Verified")).toBeInTheDocument();
    expect(screen.getByText("Re-verify")).toBeInTheDocument();
  });

  it("shows failed status with the verify error", () => {
    renderComponent({
      connectionConfig: makeConfig({
        connection_verified: false,
        connection_verified_error: "Bad response",
      }),
    });
    expect(screen.getByText("Failed")).toBeInTheDocument();
    expect(screen.getByText("Bad response")).toBeInTheDocument();
  });

  it("shows the sample response JSON when verification failed", () => {
    hookState.verifySampleResponse = { foo: "bar" };
    renderComponent({
      connectionConfig: makeConfig({
        connection_verified: false,
        connection_verified_error: "Bad response",
      }),
    });
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it("opens and closes the verify dialog", async () => {
    const user = setupUser();
    renderComponent({ agentUrl: "https://example.com" });

    await user.click(screen.getByText("Verify"));
    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();

    await user.click(screen.getByText("Close dialog"));
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });

  it("runs a successful verification and reports success", async () => {
    const user = setupUser();
    verifyAdHoc.mockResolvedValue(true);
    const { onConnectionConfigChange, onVerificationSuccess } = renderComponent({
      agentUrl: "https://example.com",
      agentHeaders: [{ key: "Authorization", value: "Bearer x" }],
    });

    await user.click(screen.getByText("Verify"));
    await user.click(screen.getByText("Confirm verify"));

    await waitFor(() =>
      expect(verifyAdHoc).toHaveBeenCalledWith(
        "https://example.com",
        { Authorization: "Bearer x" },
        [{ role: "user", content: "Hi" }]
      )
    );

    await waitFor(() =>
      expect(onConnectionConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({ connection_verified: true })
      )
    );
    expect(onVerificationSuccess).toHaveBeenCalled();
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
    expect(await screen.findByText("Verified")).toBeInTheDocument();
  });

  it("runs a failed verification and keeps the dialog open", async () => {
    const user = setupUser();
    verifyAdHoc.mockResolvedValue(false);
    hookState.verifyError = "Connection refused";
    const { onConnectionConfigChange, onVerificationSuccess } = renderComponent({
      agentUrl: "https://example.com",
    });

    await user.click(screen.getByText("Verify"));
    await user.click(screen.getByText("Confirm verify"));

    await waitFor(() =>
      expect(onConnectionConfigChange).toHaveBeenCalledWith(
        expect.objectContaining({
          connection_verified: false,
          connection_verified_error: "Connection refused",
        })
      )
    );
    expect(onVerificationSuccess).not.toHaveBeenCalled();
    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
  });

  it("ignores headers without a key when building the verify payload", async () => {
    const user = setupUser();
    verifyAdHoc.mockResolvedValue(true);
    renderComponent({
      agentUrl: "https://example.com",
      agentHeaders: [
        { key: "", value: "ignored" },
        { key: "X-Test", value: "keep" },
      ],
    });

    await user.click(screen.getByText("Verify"));
    await user.click(screen.getByText("Confirm verify"));

    await waitFor(() =>
      expect(verifyAdHoc).toHaveBeenCalledWith(
        "https://example.com",
        { "X-Test": "keep" },
        expect.anything()
      )
    );
  });

  it("resets verified status and dismisses when the URL is edited after verification", () => {
    const { rerender, onConnectionConfigChange } = renderComponent({
      agentUrl: "https://example.com",
      connectionConfig: makeConfig({
        connection_verified: true,
        agent_url: "https://example.com",
      }),
    });
    expect(screen.getByText("Verified")).toBeInTheDocument();

    rerender(
      <AgentConnectionTabContent
        agentUuid="agent-1"
        agentUrl="https://example.com/changed"
        onAgentUrlChange={jest.fn()}
        agentHeaders={[]}
        onAgentHeadersChange={jest.fn()}
        connectionConfig={makeConfig({
          connection_verified: true,
          agent_url: "https://example.com",
        })}
        onConnectionConfigChange={onConnectionConfigChange}
        onSave={jest.fn()}
        isSaving={false}
      />
    );

    expect(dismiss).toHaveBeenCalled();
    expect(onConnectionConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ connection_verified: false })
    );
    expect(screen.getByText("Not verified")).toBeInTheDocument();
  });

  it("restores verified status when the draft matches the verified snapshot again", () => {
    const { rerender, onConnectionConfigChange } = renderComponent({
      agentUrl: "https://example.com",
      connectionConfig: makeConfig({
        connection_verified: true,
        agent_url: "https://example.com",
        connection_verified_at: "2024-01-01T00:00:00Z",
      }),
    });

    // Edit away from the verified snapshot.
    rerender(
      <AgentConnectionTabContent
        agentUuid="agent-1"
        agentUrl="https://example.com/x"
        onAgentUrlChange={jest.fn()}
        agentHeaders={[]}
        onAgentHeadersChange={jest.fn()}
        connectionConfig={makeConfig({
          connection_verified: true,
          agent_url: "https://example.com",
          connection_verified_at: "2024-01-01T00:00:00Z",
        })}
        onConnectionConfigChange={onConnectionConfigChange}
        onSave={jest.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText("Not verified")).toBeInTheDocument();

    // Revert back to the originally verified URL.
    rerender(
      <AgentConnectionTabContent
        agentUuid="agent-1"
        agentUrl="https://example.com"
        onAgentUrlChange={jest.fn()}
        agentHeaders={[]}
        onAgentHeadersChange={jest.fn()}
        connectionConfig={makeConfig({
          connection_verified: true,
          agent_url: "https://example.com",
          connection_verified_at: "2024-01-01T00:00:00Z",
        })}
        onConnectionConfigChange={onConnectionConfigChange}
        onSave={jest.fn()}
        isSaving={false}
      />
    );
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("keeps verified status on rerender when headers still match the verified snapshot", () => {
    const { rerender, onConnectionConfigChange } = renderComponent({
      agentUrl: "https://example.com",
      agentHeaders: [{ key: "X-Test", value: "v1" }],
      connectionConfig: makeConfig({
        connection_verified: true,
        agent_url: "https://example.com",
        agent_headers: { "X-Test": "v1" },
      }),
    });
    expect(screen.getByText("Verified")).toBeInTheDocument();

    // Rerender with the same headers/url (including a blank-key header that
    // should be filtered out) — status should remain verified.
    rerender(
      <AgentConnectionTabContent
        agentUuid="agent-1"
        agentUrl="https://example.com"
        onAgentUrlChange={jest.fn()}
        agentHeaders={[
          { key: "X-Test", value: "v1" },
          { key: "  ", value: "ignored" },
        ]}
        onAgentHeadersChange={jest.fn()}
        connectionConfig={makeConfig({
          connection_verified: true,
          agent_url: "https://example.com",
          agent_headers: { "X-Test": "v1" },
        })}
        onConnectionConfigChange={onConnectionConfigChange}
        onSave={jest.fn()}
        isSaving={false}
      />
    );

    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("adds, edits, and removes headers", async () => {
    const user = setupUser();
    const { onAgentHeadersChange, rerender } = renderComponent();

    await user.click(screen.getByText("Add header"));
    expect(onAgentHeadersChange).toHaveBeenCalledWith([{ key: "", value: "" }]);

    rerender(
      <AgentConnectionTabContent
        agentUuid="agent-1"
        agentUrl=""
        onAgentUrlChange={jest.fn()}
        agentHeaders={[{ key: "K", value: "V" }]}
        onAgentHeadersChange={onAgentHeadersChange}
        connectionConfig={makeConfig()}
        onConnectionConfigChange={jest.fn()}
        onSave={jest.fn()}
        isSaving={false}
      />
    );

    // Both the mobile card layout and the desktop inline row render their own
    // inputs bound to the same handler; exercise both to cover each block.
    const keyInputs = screen.getAllByPlaceholderText("Header name");
    fireEvent.change(keyInputs[0], { target: { value: "New-Key" } });
    expect(onAgentHeadersChange).toHaveBeenCalledWith([
      { key: "New-Key", value: "V" },
    ]);
    fireEvent.change(keyInputs[1], { target: { value: "Desktop-Key" } });
    expect(onAgentHeadersChange).toHaveBeenCalledWith([
      { key: "Desktop-Key", value: "V" },
    ]);

    const valueInputs = screen.getAllByPlaceholderText("Value");
    fireEvent.change(valueInputs[0], { target: { value: "New-Value" } });
    expect(onAgentHeadersChange).toHaveBeenCalledWith([
      { key: "K", value: "New-Value" },
    ]);
    fireEvent.change(valueInputs[1], { target: { value: "Desktop-Value" } });
    expect(onAgentHeadersChange).toHaveBeenCalledWith([
      { key: "K", value: "Desktop-Value" },
    ]);

    const removeButtons = screen
      .getAllByRole("button")
      .filter(
        (b) =>
          b.querySelector("path")?.getAttribute("d") === "M6 18L18 6M6 6l12 12"
      );
    await user.click(removeButtons[0]);
    expect(onAgentHeadersChange).toHaveBeenCalledWith([]);
  });

  it("toggles the URL change handler", async () => {
    const user = setupUser();
    const { onAgentUrlChange } = renderComponent();
    const urlInput = screen.getByPlaceholderText(
      "https://your-agent.example.com/chat"
    );
    await user.type(urlInput, "h");
    expect(onAgentUrlChange).toHaveBeenCalledWith("h");
  });

  it("toggles benchmark support and shows the provider picker", async () => {
    const user = setupUser();
    const { onConnectionConfigChange } = renderComponent();

    expect(
      screen.queryByText("Model provider")
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByText("Support benchmarking different models").parentElement!
        .querySelector("button") as HTMLButtonElement
    );
    expect(onConnectionConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        supports_benchmark: true,
        benchmark_provider: "openrouter",
      })
    );
  });

  it("shows the provider picker and model example when benchmarking is enabled", () => {
    renderComponent({
      connectionConfig: makeConfig({
        supports_benchmark: true,
        benchmark_provider: "openai",
      }),
    });
    expect(screen.getByText("Model provider")).toBeInTheDocument();
    expect(screen.getByText(/"model": "gpt-4.1"/)).toBeInTheDocument();
  });

  it("falls back to a generic model name for an unknown provider", () => {
    renderComponent({
      connectionConfig: makeConfig({
        supports_benchmark: true,
        benchmark_provider: "some-unknown-provider",
      }),
    });
    expect(screen.getByText(/"model": "model-name"/)).toBeInTheDocument();
  });

  it("changes the benchmark provider via the select", () => {
    const { onConnectionConfigChange } = renderComponent({
      connectionConfig: makeConfig({ supports_benchmark: true }),
    });
    const select = screen.getByDisplayValue("OpenRouter (all providers)");
    fireEvent.change(select, { target: { value: "anthropic" } });
    expect(onConnectionConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({ benchmark_provider: "anthropic" })
    );
  });

  it("turns off benchmarking, preserving the last provider", async () => {
    const user = setupUser();
    const { onConnectionConfigChange } = renderComponent({
      connectionConfig: makeConfig({
        supports_benchmark: true,
        benchmark_provider: "google",
      }),
    });

    await user.click(
      screen.getByText("Support benchmarking different models").parentElement!
        .querySelector("button") as HTMLButtonElement
    );
    expect(onConnectionConfigChange).toHaveBeenCalledWith(
      expect.objectContaining({
        supports_benchmark: false,
        benchmark_provider: "google",
      })
    );
  });

  it("toggles the tool-calls example format", async () => {
    const user = setupUser();
    renderComponent();

    expect(
      screen.getByText(/"response": "Aapki beti/)
    ).toBeInTheDocument();
    expect(screen.queryByText(/tool_calls/)).not.toBeInTheDocument();

    await user.click(
      screen.getByText("Does your agent return tool calls?")
    );
    expect(screen.getByText(/tool_calls/)).toBeInTheDocument();
    expect(
      screen.getByText(/is optional\. Include the tool/)
    ).toBeInTheDocument();
  });

  it("disables the verify button while a verification is in flight", () => {
    hookState.isVerifying = true;
    renderComponent({ agentUrl: "https://example.com" });
    const verifyButton = screen.getByText("Verify").closest("button");
    expect(verifyButton).toBeDisabled();
  });

  it("shows the verifying label once a verification has been kicked off", async () => {
    const user = setupUser();
    verifyAdHoc.mockImplementation(() => new Promise(() => {}));
    renderComponent({ agentUrl: "https://example.com" });

    await user.click(screen.getByText("Verify"));
    await user.click(screen.getByText("Confirm verify"));

    expect(await screen.findByText("Verifying...")).toBeInTheDocument();
  });
});
