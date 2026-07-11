import React from "react";
import { render, screen, setupUser, waitFor, within } from "../../test-utils";
import { BenchmarkDialog } from "../BenchmarkDialog";
import { signOut } from "next-auth/react";

// ---- Mocks ----

const mockUseOpenRouterModels = jest.fn();
const mockUseAccessToken = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useOpenRouterModels: (...args: unknown[]) => mockUseOpenRouterModels(...args),
  useAccessToken: (...args: unknown[]) => mockUseAccessToken(...args),
}));

jest.mock("../../lib/api", () => ({
  __esModule: true,
  getDefaultHeaders: jest.fn(() => ({})),
}));

jest.mock("../../components/AppLayout", () => ({
  __esModule: true,
  useHideFloatingButton: jest.fn(),
}));

jest.mock("../agent-tabs/LLMSelectorModal", () => ({
  __esModule: true,
  LLMSelectorModal: (props: any) => {
    if (!props.isOpen) return null;
    const models = (props.availableProviders || []).flatMap(
      (p: any) => p.models,
    );
    return (
      <div data-testid="llm-selector-modal">
        {models.map((m: any) => (
          <button key={m.id} onClick={() => props.onSelect(m)}>
            select-{m.id}
          </button>
        ))}
        <button onClick={props.onClose}>close-selector</button>
      </div>
    );
  },
}));

jest.mock("../BenchmarkResultsDialog", () => ({
  __esModule: true,
  BenchmarkResultsDialog: (props: any) => {
    if (!props.isOpen) return null;
    return (
      <div data-testid="benchmark-results-dialog">
        {JSON.stringify({
          agentUuid: props.agentUuid,
          models: props.models,
          testUuids: props.testUuids,
        })}
        <button onClick={props.onClose}>results-close</button>
        <button onClick={props.onGoBack}>results-go-back</button>
      </div>
    );
  },
}));

jest.mock("../VerifyRequestPreviewDialog", () => ({
  __esModule: true,
  VerifyRequestPreviewDialog: (props: any) => {
    if (!props.open) return null;
    return (
      <div data-testid="verify-dialog">
        <button onClick={() => props.onConfirm([])}>Confirm</button>
        <button onClick={props.onClose}>Cancel</button>
        {props.isVerifying && <span>verifying</span>}
      </div>
    );
  },
}));

// ---- Fixtures ----

const providersFixture = [
  {
    slug: "openai",
    name: "OpenAI",
    models: [
      { id: "openai/gpt-4o", name: "GPT-4o" },
      { id: "openai/gpt-4o-mini", name: "GPT-4o mini" },
    ],
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    models: [
      { id: "anthropic/claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
      { id: "anthropic/claude-3-haiku", name: "Claude 3 Haiku" },
    ],
  },
];

const tests = [
  {
    uuid: "test-1",
    name: "Test One",
    description: "",
    type: "response" as const,
    config: {},
    created_at: "",
    updated_at: "",
  },
  {
    uuid: "test-2",
    name: "Test Two",
    description: "",
    type: "response" as const,
    config: {},
    created_at: "",
    updated_at: "",
  },
];

function baseProps(overrides: Partial<React.ComponentProps<typeof BenchmarkDialog>> = {}) {
  return {
    isOpen: true,
    onClose: jest.fn(),
    agentUuid: "agent-1",
    agentName: "My Agent",
    tests,
    ...overrides,
  };
}

async function selectModelForRow(user: ReturnType<typeof setupUser>, rowIndex: number, modelId: string) {
  const selectButtons = screen.getAllByText("Select a model");
  await user.click(selectButtons[rowIndex] ?? screen.getAllByRole("button", { name: /Select a model|.+/ })[0]);
}

describe("BenchmarkDialog", () => {
  beforeEach(() => {
    mockUseOpenRouterModels.mockReturnValue({ providers: providersFixture });
    mockUseAccessToken.mockReturnValue("test-token");
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://test-backend";
    global.fetch = jest.fn();
    (signOut as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BenchmarkDialog {...baseProps({ isOpen: false })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders header, one row, and add model button", () => {
    render(<BenchmarkDialog {...baseProps()} />);
    expect(screen.getByText("Compare different models")).toBeInTheDocument();
    expect(
      screen.getByText("Select up to 5 models to benchmark on the tests"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Select a model")).toHaveLength(1);
    expect(screen.getByText("Add model")).toBeInTheDocument();
    // remove button hidden with single row
    expect(screen.queryByTitle("Remove model")).not.toBeInTheDocument();
  });

  it("opens the LLM selector modal and selects a model, filling the row", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
    expect(screen.getByTestId("llm-selector-modal")).toBeInTheDocument();

    await user.click(screen.getByText("select-openai/gpt-4o"));

    expect(screen.queryByTestId("llm-selector-modal")).not.toBeInTheDocument();
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
  });

  it("closes the selector modal via its close button without selecting", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("close-selector"));

    expect(screen.queryByTestId("llm-selector-modal")).not.toBeInTheDocument();
    expect(screen.getByText("Select a model")).toBeInTheDocument();
  });

  it("adds rows up to the max of 5, then hides add button", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    for (let i = 0; i < 4; i++) {
      await user.click(screen.getByText("Add model"));
    }

    expect(screen.getAllByText("Select a model")).toHaveLength(5);
    expect(screen.queryByText("Add model")).not.toBeInTheDocument();
    // remove buttons now shown since length > 1
    expect(screen.getAllByTitle("Remove model")).toHaveLength(5);
  });

  it("removes a single row, keeping the others", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Add model"));
    // select model in first row
    const selectButtons = screen.getAllByText("Select a model");
    await user.click(selectButtons[0]);
    await user.click(screen.getByText("select-openai/gpt-4o"));

    // now row0 = GPT-4o, row1 = empty
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getAllByText("Select a model")).toHaveLength(1);

    const removeButtons = screen.getAllByTitle("Remove model");
    // remove the second (empty) row
    await user.click(removeButtons[1]);

    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.queryAllByText("Select a model")).toHaveLength(0);
    expect(screen.queryByTitle("Remove model")).not.toBeInTheDocument();
  });

  it("excludes already-selected models from other rows but keeps the current row's own selection available", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Add model"));
    const selectButtons = screen.getAllByText("Select a model");
    await user.click(selectButtons[0]);
    await user.click(screen.getByText("select-openai/gpt-4o"));

    // Open row 1's selector - gpt-4o should not appear (already selected elsewhere)
    await user.click(screen.getByText("Select a model"));
    expect(screen.queryByText("select-openai/gpt-4o")).not.toBeInTheDocument();
    expect(screen.getByText("select-openai/gpt-4o-mini")).toBeInTheDocument();
    await user.click(screen.getByText("close-selector"));

    // Re-open row 0's selector (which has gpt-4o selected) - gpt-4o should still be selectable
    await user.click(screen.getByText("GPT-4o"));
    expect(screen.getByText("select-openai/gpt-4o")).toBeInTheDocument();
  });

  it("filters providers by benchmarkProvider when set to a non-openrouter value", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ benchmarkProvider: "anthropic" })} />);

    await user.click(screen.getByText("Select a model"));
    expect(screen.getByText("select-anthropic/claude-3-5-sonnet")).toBeInTheDocument();
    expect(screen.getByText("select-anthropic/claude-3-haiku")).toBeInTheDocument();
    expect(screen.queryByText("select-openai/gpt-4o")).not.toBeInTheDocument();
  });

  it("shows all providers when benchmarkProvider is 'openrouter' or unset", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ benchmarkProvider: "openrouter" })} />);

    await user.click(screen.getByText("Select a model"));
    expect(screen.getByText("select-openai/gpt-4o")).toBeInTheDocument();
    expect(screen.getByText("select-anthropic/claude-3-5-sonnet")).toBeInTheDocument();
  });

  it("disables Run comparison when no model is selected, enables once one is picked", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    const runButton = screen.getByRole("button", { name: /Run comparison/i });
    expect(runButton).toBeDisabled();

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));

    expect(runButton).not.toBeDisabled();
  });

  it("non-connection agent: Run comparison directly shows results with correct props", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    const resultsDialog = await screen.findByTestId("benchmark-results-dialog");
    const payload = JSON.parse(resultsDialog.textContent!.split("results-close")[0].split("results-go-back")[0] || "{}");
    expect(payload.agentUuid).toBe("agent-1");
    expect(payload.models).toEqual(["openai/gpt-4o"]);
    expect(payload.testUuids).toEqual(["test-1", "test-2"]);
  });

  it("connection agent: Run comparison with unverified model opens verify dialog instead of results", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results-dialog")).not.toBeInTheDocument();
  });

  it("connection agent: confirming verify dialog on success shows results", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    });
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://test-backend/agents/agent-1/verify-connection",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(await screen.findByTestId("benchmark-results-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });

  it("connection agent: failed verification keeps verify dialog closed, no results, and shows failed badge with expandable detail", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({
        success: false,
        error: "connection refused",
        sample_response: { foo: "bar" },
      }),
    });
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
    expect(screen.queryByTestId("benchmark-results-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();

    // expand detail
    await user.click(screen.getByTitle("View details"));
    expect(screen.getByText("connection refused")).toBeInTheDocument();
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();

    // collapse again
    await user.click(screen.getByTitle("View details"));
    expect(screen.queryByText("connection refused")).not.toBeInTheDocument();
  });

  it("401 response triggers signOut and treats model as not verified", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 401,
      ok: false,
      json: async () => ({}),
    });
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });
    expect(screen.queryByTestId("benchmark-results-dialog")).not.toBeInTheDocument();
  });

  it("network error from fetch is caught and marks model failed without crashing", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
    await user.click(screen.getByTitle("View details"));
    expect(screen.getByText("network down")).toBeInTheDocument();
  });

  it("missing BACKEND_URL causes a caught error and failed status", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByTitle("View details"));
    expect(screen.getByText("BACKEND_URL not set")).toBeInTheDocument();

    process.env.NEXT_PUBLIC_BACKEND_URL = "http://test-backend";
  });

  it("shows Retry failed button only when there are failed models, retries via verify dialog", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: false, error: "oops" }),
    });
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    expect(screen.queryByText("Retry failed")).not.toBeInTheDocument();

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeInTheDocument();
    });

    const retryButton = await screen.findByText("Retry failed");
    expect(retryButton).toBeInTheDocument();

    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    });

    await user.click(retryButton);
    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
    await user.click(screen.getByText("Confirm"));

    expect(await screen.findByTestId("benchmark-results-dialog")).toBeInTheDocument();
  });

  it("shows 'not checked' badge for connection agent when no verification entry exists", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));

    expect(screen.getByText("not checked")).toBeInTheDocument();
  });

  it("does not show a verification badge for non-connection agent types", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));

    expect(screen.queryByText("not checked")).not.toBeInTheDocument();
    expect(screen.queryByText("verified")).not.toBeInTheDocument();
  });

  it("only retains verified=true entries from initial benchmarkModelsVerified prop", async () => {
    const user = setupUser();
    render(
      <BenchmarkDialog
        {...baseProps({
          agentType: "connection",
          benchmarkModelsVerified: {
            "openai/gpt-4o": {
              verified: true,
              verified_at: "2024-01-01T00:00:00.000Z",
              error: null,
            },
            "openai/gpt-4o-mini": {
              verified: false,
              verified_at: "2024-01-01T00:00:00.000Z",
              error: "bad",
            },
          },
        })}
      />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    expect(screen.getByText("verified")).toBeInTheDocument();

    await user.click(screen.getByText("Add model"));
    const remainingSelect = screen.getByText("Select a model");
    await user.click(remainingSelect);
    await user.click(screen.getByText("select-openai/gpt-4o-mini"));

    // dropped false entry -> "not checked", not "failed"
    expect(screen.getByText("not checked")).toBeInTheDocument();
    expect(screen.queryByText("failed")).not.toBeInTheDocument();
  });

  it("shows verifying badge and disables Run comparison while a verification is in flight", async () => {
    let resolveFetch: (v: any) => void;
    (global.fetch as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveFetch = resolve;
      }),
    );
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getAllByText("verifying").length).toBeGreaterThan(0);
    });
    expect(screen.getByRole("button", { name: /Run comparison/i })).toBeDisabled();

    resolveFetch!({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    });

    await screen.findByTestId("benchmark-results-dialog");
  });

  it("closes dialog via the X button, resetting state and calling onClose", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { rerender } = render(
      <BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />,
    );

    await user.click(screen.getByText("Add model"));
    await user.click(screen.getAllByText("Select a model")[0]);
    await user.click(screen.getByText("select-openai/gpt-4o"));
    expect(screen.getAllByText("Select a model")).toHaveLength(1);

    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find((b) => b.querySelector("svg") && b.className.includes("w-8 h-8") && b.className.includes("rounded-md") && !b.title);
    // Use the header close button specifically: it's the first button in the header row
    const header = screen.getByText("Compare different models").closest("div")!.parentElement!;
    const headerCloseButton = within(header).getAllByRole("button")[0];
    await user.click(headerCloseButton);

    expect(onClose).toHaveBeenCalledTimes(1);

    // re-render with the same isOpen=true to check state reset (selectedModels back to [null])
    rerender(<BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />);
    expect(screen.getAllByText("Select a model")).toHaveLength(1);
  });

  it("closes dialog via the Cancel button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BenchmarkDialog {...baseProps({ onClose })} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("go back from results returns to the model selection view", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    await screen.findByTestId("benchmark-results-dialog");
    await user.click(screen.getByText("results-go-back"));

    expect(screen.queryByTestId("benchmark-results-dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Compare different models")).toBeInTheDocument();
  });

  it("results dialog close triggers full handleClose (calls onClose)", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    await screen.findByTestId("benchmark-results-dialog");
    await user.click(screen.getByText("results-close"));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closing verify dialog via Cancel clears pending verify action without showing results", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    const verifyDialog = screen.getByTestId("verify-dialog");
    expect(verifyDialog).toBeInTheDocument();

    await user.click(within(verifyDialog).getByText("Cancel"));
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results-dialog")).not.toBeInTheDocument();
  });
});
