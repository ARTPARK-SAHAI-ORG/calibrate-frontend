import React from "react";
import { render, screen, setupUser, waitFor, within } from "../../test-utils";
import { BenchmarkDialog } from "../BenchmarkDialog";
import { signOut } from "next-auth/react";
import { toast } from "sonner";

// ---- Mocks ----

const mockUseOpenRouterModels = jest.fn();
const mockUseAccessToken = jest.fn();
const mockUseBenchmarkParallelDefault = jest.fn();
const mockUpdateOrganization = jest.fn();

jest.mock("../../hooks", () => ({
  __esModule: true,
  useOpenRouterModels: (...args: unknown[]) => mockUseOpenRouterModels(...args),
  useAccessToken: (...args: unknown[]) => mockUseAccessToken(...args),
  useActiveOrgUuid: () => ["org-1", jest.fn()],
  // The dialog reads the workspace's own choice off this list. Undefined
  // stands for a workspace whose choice has not been read yet.
  useOrganizations: () => ({
    organizations: [
      {
        uuid: "org-1",
        settings: {
          model_benchmarking: {
            run_models_in_parallel: mockUseBenchmarkParallelDefault(),
          },
        },
      },
    ],
    updateOrganization: mockUpdateOrganization,
  }),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

jest.mock("../../lib/api", () => ({
  __esModule: true,
  getDefaultHeaders: jest.fn(() => ({})),
}));

// The run size limit. High by default so existing runs are never blocked;
// lowered in the limit-specific tests below.
const mockGetMaxRowsPerEval = jest.fn(async () => 100);
jest.mock("../../hooks/useMaxRowsPerEval", () => ({
  __esModule: true,
  getMaxRowsPerEval: (...args: unknown[]) => mockGetMaxRowsPerEval(...args),
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn() },
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
          parallelModels: props.parallelModels,
        })}
        <button onClick={props.onClose}>results-close</button>
        <button onClick={props.onGoBack}>results-go-back</button>
        <button onClick={() => props.onRunTests?.(mockTickedTests)}>
          results-run-ticked
        </button>
        <button onClick={() => props.onCompareTests?.(mockTickedTests)}>
          results-compare-ticked
        </button>
      </div>
    );
  },
}));

// What the reader ticked inside the comparison window.
const mockTickedTests = [{ uuid: "test-2", name: "Test Two" }];

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
  {
    slug: "google",
    name: "Google",
    models: [{ id: "google/gemini-pro", name: "Gemini Pro" }],
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

function baseProps(
  overrides: Partial<React.ComponentProps<typeof BenchmarkDialog>> = {},
) {
  return {
    isOpen: true,
    onClose: jest.fn(),
    agentUuid: "agent-1",
    agentName: "My Agent",
    tests,
    ...overrides,
  };
}

async function selectModelForRow(
  user: ReturnType<typeof setupUser>,
  rowIndex: number,
  modelId: string,
) {
  const selectButtons = screen.getAllByText("Select a model");
  await user.click(
    selectButtons[rowIndex] ??
      screen.getAllByRole("button", { name: /Select a model|.+/ })[0],
  );
}

describe("BenchmarkDialog", () => {
  beforeEach(() => {
    mockUseOpenRouterModels.mockReturnValue({ providers: providersFixture });
    mockUseAccessToken.mockReturnValue("test-token");
    // The workspaces have not loaded yet, which is what the very first render
    // sees in the app.
    mockUseBenchmarkParallelDefault.mockReturnValue(undefined);
    mockUpdateOrganization.mockResolvedValue({});
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

  it("renders header and one blank row with no remove button", () => {
    render(<BenchmarkDialog {...baseProps()} />);
    expect(screen.getByText("Compare different models")).toBeInTheDocument();
    expect(
      screen.getByText(
        `Select up to 5 models to benchmark on the ${tests.length} tests`,
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Select a model")).toHaveLength(1);
    expect(screen.queryByText("Add model")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Remove model" }),
    ).not.toBeInTheDocument();
  });

  it("counts every linked test in the subtitle when no tests are picked", () => {
    render(<BenchmarkDialog {...baseProps({ tests: [], totalTests: 7 })} />);
    expect(
      screen.getByText("Select up to 5 models to benchmark on the 7 tests"),
    ).toBeInTheDocument();
  });

  it("says one test in the singular", () => {
    render(<BenchmarkDialog {...baseProps({ tests: tests.slice(0, 1) })} />);
    expect(
      screen.getByText("Select up to 5 models to benchmark on the test"),
    ).toBeInTheDocument();
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

  it("picking a model adds the next blank row, until five are chosen", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    const ids = [
      "openai/gpt-4o",
      "openai/gpt-4o-mini",
      "anthropic/claude-3-5-sonnet",
      "anthropic/claude-3-haiku",
      "google/gemini-pro",
    ];
    for (const [i, id] of ids.entries()) {
      // Always exactly one blank row, and one remove button per chosen row.
      expect(screen.getAllByText("Select a model")).toHaveLength(1);
      expect(
        screen.queryAllByRole("button", { name: "Remove model" }),
      ).toHaveLength(i);
      await user.click(screen.getByText("Select a model"));
      await user.click(screen.getByText(`select-${id}`));
    }

    // Five chosen: no blank row left.
    expect(screen.queryByText("Select a model")).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(5);
  });

  it("names the remove button in the app's own hover text, not the browser's", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));

    const remove = screen.getByRole("button", { name: "Remove model" });
    expect(remove).not.toHaveAttribute("title");

    await user.hover(remove);
    expect(await screen.findByText("Remove model")).toBeInTheDocument();
  });

  it("removes a chosen row, keeping the others and the blank row", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o-mini"));

    // row0 = GPT-4o, row1 = GPT-4o mini, row2 = blank
    expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(2);
    await user.click(
      screen.getAllByRole("button", { name: "Remove model" })[0],
    );

    expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();
    expect(screen.getByText("GPT-4o mini")).toBeInTheDocument();
    expect(screen.getAllByText("Select a model")).toHaveLength(1);
    expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(1);
  });

  it("excludes already-selected models from other rows but keeps the current row's own selection available", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
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
    render(
      <BenchmarkDialog {...baseProps({ benchmarkProvider: "anthropic" })} />,
    );

    await user.click(screen.getByText("Select a model"));
    expect(
      screen.getByText("select-anthropic/claude-3-5-sonnet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("select-anthropic/claude-3-haiku"),
    ).toBeInTheDocument();
    expect(screen.queryByText("select-openai/gpt-4o")).not.toBeInTheDocument();
  });

  it("shows all providers when benchmarkProvider is 'openrouter' or unset", async () => {
    const user = setupUser();
    render(
      <BenchmarkDialog {...baseProps({ benchmarkProvider: "openrouter" })} />,
    );

    await user.click(screen.getByText("Select a model"));
    expect(screen.getByText("select-openai/gpt-4o")).toBeInTheDocument();
    expect(
      screen.getByText("select-anthropic/claude-3-5-sonnet"),
    ).toBeInTheDocument();
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

  it("blocks Run comparison before the confirm step when tests times models exceeds the limit", async () => {
    // 2 tests (from the fixture) on 1 model is already over a limit of 1.
    mockGetMaxRowsPerEval.mockResolvedValueOnce(1);
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps()} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByText("Compare the models")).not.toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("non-connection agent: Run comparison directly shows results with correct props", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );

    const resultsDialog = await screen.findByTestId("benchmark-results-dialog");
    const payload = JSON.parse(
      resultsDialog
        .textContent!.split("results-close")[0]
        .split("results-go-back")[0] || "{}",
    );
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
    // The question says the connection check with each model comes first.
    expect(
      screen.getByText(/connection is checked with each model first/),
    ).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );

    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "http://test-backend/agents/agent-1/verify-connection",
        expect.objectContaining({ method: "POST" }),
      );
    });

    expect(
      await screen.findByTestId("benchmark-results-dialog"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });

  it("tells the parent about a model that passed its check, and not about one that failed", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        status: 200,
        ok: true,
        json: async () => ({ success: false, error: "connection refused" }),
      });
    const onModelVerified = jest.fn();
    const user = setupUser();
    render(
      <BenchmarkDialog
        {...baseProps({ agentType: "connection", onModelVerified })}
      />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-anthropic/claude-3-5-sonnet"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => expect(onModelVerified).toHaveBeenCalledTimes(1));
    expect(onModelVerified).toHaveBeenCalledWith(
      "openai/gpt-4o",
      expect.objectContaining({ verified: true, error: null }),
    );
  });

  it("says failed when the check gives no reason to show", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: false, error: null }),
    });
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getByText("failed")).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: /see why/i })).toBeNull();
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /see why/i }),
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();

    // expand detail
    await user.click(screen.getByRole("button", { name: /see why/i }));
    expect(screen.getByText("connection refused")).toBeInTheDocument();
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();

    // collapse again
    await user.click(screen.getByRole("button", { name: /see why/i }));
    expect(screen.queryByText("connection refused")).not.toBeInTheDocument();

    // Both panels open beside the box, so opening one closes the other.
    await user.click(screen.getByRole("button", { name: "How to run the models" }));
    expect(screen.getByLabelText("Sequential")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /see why/i }));
    expect(screen.getByText("connection refused")).toBeInTheDocument();
    expect(screen.queryByLabelText("Sequential")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How to run the models" }));
    expect(screen.getByLabelText("Sequential")).toBeInTheDocument();
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: "/login?callbackUrl=%2F",
      });
    });
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
  });

  it("network error from fetch is caught and marks model failed without crashing", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /see why/i }),
      ).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /see why/i }));
    expect(screen.getByText("network down")).toBeInTheDocument();
  });

  it("missing BACKEND_URL causes a caught error and failed status", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /see why/i }),
      ).toBeInTheDocument();
    });
    expect(global.fetch).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /see why/i }));
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /see why/i }),
      ).toBeInTheDocument();
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

    expect(
      await screen.findByTestId("benchmark-results-dialog"),
    ).toBeInTheDocument();
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

    await user.click(screen.getByText("Select a model"));
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    await waitFor(() => {
      expect(screen.getAllByText("verifying").length).toBeGreaterThan(0);
    });
    expect(
      screen.getByRole("button", { name: /Run comparison/i }),
    ).toBeDisabled();

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

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    expect(screen.getAllByText("Select a model")).toHaveLength(1);

    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(
      (b) =>
        b.querySelector("svg") &&
        b.className.includes("w-8 h-8") &&
        b.className.includes("rounded-md") &&
        !b.title,
    );
    // Use the header close button specifically: it's the first button in the header row
    const header = screen
      .getByText("Compare different models")
      .closest("div")!.parentElement!;
    const headerCloseButton = within(header).getAllByRole("button")[0];
    await user.click(headerCloseButton);

    expect(onClose).toHaveBeenCalledTimes(1);

    // re-render with the same isOpen=true to check state reset (selectedModels back to [null])
    rerender(
      <BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />,
    );
    expect(screen.getAllByText("Select a model")).toHaveLength(1);
  });

  it("does not carry a failed check into the next window", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: false, error: "connection refused" }),
    });
    const user = setupUser();
    const onClose = jest.fn();
    const { rerender } = render(
      <BenchmarkDialog {...baseProps({ onClose, agentType: "connection" })} />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /see why/i }),
      ).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    rerender(
      <BenchmarkDialog
        {...baseProps({ onClose, agentType: "connection", isOpen: false })}
      />,
    );
    rerender(
      <BenchmarkDialog {...baseProps({ onClose, agentType: "connection" })} />,
    );

    expect(screen.getByText("Select a model")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /see why/i })).toBeNull();
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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );

    await screen.findByTestId("benchmark-results-dialog");
    await user.click(screen.getByText("results-go-back"));

    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Compare different models")).toBeInTheDocument();
  });

  it("results dialog close triggers full handleClose (calls onClose)", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(<BenchmarkDialog {...baseProps({ onClose, agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );

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
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    const verifyDialog = screen.getByTestId("verify-dialog");
    expect(verifyDialog).toBeInTheDocument();

    await user.click(within(verifyDialog).getByText("Cancel"));
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
  });
  it("shows what will run before starting, and cancelling starts nothing", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "agent" })} />);

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    expect(
      screen.getByText(/This will start the comparison on 2 tests with GPT-4o/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/connection is checked with each model first/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();

    await user.click(
      screen.getAllByRole("button", { name: "Cancel" }).slice(-1)[0],
    );
    expect(
      screen.queryByText(/This will start the comparison/),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("benchmark-results-dialog"),
    ).not.toBeInTheDocument();
  });

  it("build agent: has no way to run the models and sends no run order", async () => {
    const user = setupUser();
    render(<BenchmarkDialog {...baseProps({ agentType: "agent" })} />);

    expect(
      screen.queryByRole("button", { name: "How to run the models" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );

    const payload = JSON.parse(
      (
        await screen.findByTestId("benchmark-results-dialog")
      ).textContent!.split("results-close")[0],
    );
    expect(payload).not.toHaveProperty("parallelModels");
  });

  async function startConnectionComparison(
    user: ReturnType<typeof setupUser>,
    pickOrder?: "Parallel" | "Sequential",
  ) {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => ({ success: true }),
    });
    render(<BenchmarkDialog {...baseProps({ agentType: "connection" })} />);

    // The panel starts closed, so the options are not on screen yet.
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "How to run the models" }));
    expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Sequential" })).not.toBeChecked();
    if (pickOrder) {
      await user.click(screen.getByRole("radio", { name: pickOrder }));
    }

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await user.click(screen.getByText("Confirm"));

    return JSON.parse(
      (
        await screen.findByTestId("benchmark-results-dialog")
      ).textContent!.split("results-close")[0],
    );
  }

  it("connection agent: runs the models in parallel by default", async () => {
    const payload = await startConnectionComparison(setupUser());
    expect(payload.parallelModels).toBe(true);
  });

  it("connection agent: sends sequential when that option is picked", async () => {
    const payload = await startConnectionComparison(setupUser(), "Sequential");
    expect(payload.parallelModels).toBe(false);
  });

  it("names every linked test in the question when no tests are named", async () => {
    const user = setupUser();
    render(
      <BenchmarkDialog
        {...baseProps({ agentType: "agent", tests: [], totalTests: 7 })}
      />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));

    expect(
      screen.getByText(/This will start the comparison on 7 tests with GPT-4o/),
    ).toBeInTheDocument();
  });

  it("hands Run and Compare on the ticked tests to the comparison window", async () => {
    const user = setupUser();
    const onRunTests = jest.fn();
    const onCompareTests = jest.fn();
    render(
      <BenchmarkDialog
        {...baseProps({ agentType: "agent", onRunTests, onCompareTests })}
      />,
    );

    await user.click(screen.getByText("Select a model"));
    await user.click(screen.getByText("select-openai/gpt-4o"));
    await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    await user.click(
      screen.getByRole("button", { name: "Start the comparison" }),
    );
    await screen.findByTestId("benchmark-results-dialog");

    await user.click(screen.getByText("results-run-ticked"));
    expect(onRunTests).toHaveBeenCalledWith(mockTickedTests);
    await user.click(screen.getByText("results-compare-ticked"));
    expect(onCompareTests).toHaveBeenCalledWith(mockTickedTests);
  });

  describe("opening with the models a past comparison ran", () => {
    it("names those models once the model list has arrived", async () => {
      // The list of models comes from the backend, so it is empty on the first
      // render, the way it is in the app.
      mockUseOpenRouterModels.mockReturnValue({ providers: [] });
      const { rerender } = render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o", "anthropic/claude-3-haiku"],
          })}
        />,
      );
      expect(screen.getAllByText("Select a model")).toHaveLength(1);

      mockUseOpenRouterModels.mockReturnValue({ providers: providersFixture });
      rerender(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o", "anthropic/claude-3-haiku"],
          })}
        />,
      );

      expect(await screen.findByText("GPT-4o")).toBeInTheDocument();
      expect(screen.getByText("Claude 3 Haiku")).toBeInTheDocument();
      expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(2);
      expect(screen.getAllByText("Select a model")).toHaveLength(1);
    });

    it("still shows a row for a model that is no longer offered, named by its id", async () => {
      render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o", "openai/gpt-retired"],
          })}
        />,
      );

      expect(await screen.findByText("openai/gpt-retired")).toBeInTheDocument();
      expect(screen.getByText("GPT-4o")).toBeInTheDocument();
      expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(2);
    });

    it("ignores a repeated model and stops at five", async () => {
      render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: [
              "openai/gpt-4o",
              "openai/gpt-4o",
              "openai/gpt-4o-mini",
              "anthropic/claude-3-5-sonnet",
              "anthropic/claude-3-haiku",
              "google/gemini-pro",
              "openai/gpt-retired",
            ],
          })}
        />,
      );

      await screen.findByText("GPT-4o");
      // Five rows, so no blank row is left to pick a sixth in.
      expect(
      screen.getAllByRole("button", { name: "Remove model" }),
    ).toHaveLength(5);
      expect(screen.queryByText("Select a model")).not.toBeInTheDocument();
      expect(screen.queryByText("openai/gpt-retired")).not.toBeInTheDocument();
    });

    it("leaves the models alone once the reader has changed them", async () => {
      const user = setupUser();
      const { rerender } = render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o"],
          })}
        />,
      );
      await screen.findByText("GPT-4o");

      await user.click(screen.getByRole("button", { name: "Remove model" }));
      expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();

      // A new array of the same ids, the way a parent re-rendering passes it.
      rerender(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o"],
          })}
        />,
      );
      expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();
      expect(
      screen.queryByRole("button", { name: "Remove model" }),
    ).not.toBeInTheDocument();
    });

    it("runs the comparison on the models it opened with", async () => {
      const user = setupUser();
      render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "agent",
            initialModels: ["openai/gpt-4o", "anthropic/claude-3-haiku"],
          })}
        />,
      );
      await screen.findByText("GPT-4o");

      await user.click(screen.getByRole("button", { name: /Run comparison/i }));
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );

      const payload = JSON.parse(
        (
          await screen.findByTestId("benchmark-results-dialog")
        ).textContent!.split("results-close")[0],
      );
      expect(payload.models).toEqual([
        "openai/gpt-4o",
        "anthropic/claude-3-haiku",
      ]);
    });

    it("connection agent: opens on Sequential when that is what ran before, and sends it", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true }),
      });
      const user = setupUser();
      render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "connection",
            initialModels: ["openai/gpt-4o"],
            initialParallelModels: false,
          })}
        />,
      );
      await screen.findByText("GPT-4o");

      await user.click(
        screen.getByRole("button", { name: "How to run the models" }),
      );
      expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Parallel" })).not.toBeChecked();

      await user.click(screen.getByRole("button", { name: /Run comparison/i }));
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );
      await user.click(screen.getByText("Confirm"));

      const payload = JSON.parse(
        (
          await screen.findByTestId("benchmark-results-dialog")
        ).textContent!.split("results-close")[0],
      );
      expect(payload.parallelModels).toBe(false);
      expect(payload.models).toEqual(["openai/gpt-4o"]);
    });

    it("closing puts Sequential back, not Parallel, and fills the models in again on the next open", async () => {
      const user = setupUser();
      const { rerender } = render(
        <BenchmarkDialog
          {...baseProps({
            agentType: "connection",
            initialModels: ["openai/gpt-4o"],
            initialParallelModels: false,
          })}
        />,
      );
      await screen.findByText("GPT-4o");

      await user.click(
        screen.getByRole("button", { name: "How to run the models" }),
      );
      await user.click(screen.getByRole("radio", { name: "Parallel" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      rerender(
        <BenchmarkDialog
          {...baseProps({
            agentType: "connection",
            initialModels: ["openai/gpt-4o"],
            initialParallelModels: false,
            isOpen: false,
          })}
        />,
      );
      rerender(
        <BenchmarkDialog
          {...baseProps({
            agentType: "connection",
            initialModels: ["openai/gpt-4o"],
            initialParallelModels: false,
          })}
        />,
      );

      expect(await screen.findByText("GPT-4o")).toBeInTheDocument();
      await user.click(
        screen.getByRole("button", { name: "How to run the models" }),
      );
      expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
    });
  });

  describe("the workspace default for how the models run", () => {
    const connectionProps = { agentType: "connection" as const };

    async function openAdvancedSettings(
      user: ReturnType<typeof setupUser>,
    ): Promise<void> {
      await user.click(
        screen.getByRole("button", { name: "How to run the models" }),
      );
    }

    it("opens on the workspace default once it has loaded", async () => {
      const user = setupUser();
      const { rerender } = render(
        <BenchmarkDialog {...baseProps(connectionProps)} />,
      );

      // The workspaces arrive after the first render.
      mockUseBenchmarkParallelDefault.mockReturnValue(false);
      rerender(<BenchmarkDialog {...baseProps(connectionProps)} />);

      await openAdvancedSettings(user);
      expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
      expect(screen.getByRole("radio", { name: "Parallel" })).not.toBeChecked();
    });

    it("what a past comparison ran wins over the workspace default", async () => {
      mockUseBenchmarkParallelDefault.mockReturnValue(false);
      const user = setupUser();
      render(
        <BenchmarkDialog
          {...baseProps({ ...connectionProps, initialParallelModels: true })}
        />,
      );

      await openAdvancedSettings(user);
      expect(screen.getByRole("radio", { name: "Parallel" })).toBeChecked();
    });

    it("a default that arrives late does not move a choice already made", async () => {
      const user = setupUser();
      const { rerender } = render(
        <BenchmarkDialog {...baseProps(connectionProps)} />,
      );

      await openAdvancedSettings(user);
      await user.click(screen.getByRole("radio", { name: "Sequential" }));

      mockUseBenchmarkParallelDefault.mockReturnValue(true);
      rerender(<BenchmarkDialog {...baseProps(connectionProps)} />);

      expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
    });

    async function pickSequentialAndRun(
      user: ReturnType<typeof setupUser>,
      { save }: { save: boolean },
    ) {
      render(<BenchmarkDialog {...baseProps(connectionProps)} />);
      await openAdvancedSettings(user);
      await user.click(screen.getByRole("radio", { name: "Sequential" }));
      if (save) {
        await user.click(
          screen.getByRole("checkbox", {
            name: "Save this as default",
          }),
        );
      }
      await user.click(screen.getByText("Select a model"));
      await user.click(screen.getByText("select-openai/gpt-4o"));
      await user.click(screen.getByRole("button", { name: /Run comparison/i }));
    }

    it("saves the choice for the workspace when the box is ticked", async () => {
      // A connection agent checks its connection with each model before the
      // comparison starts, so the save is only right once that has passed.
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true }),
      });
      const user = setupUser();
      await pickSequentialAndRun(user, { save: true });
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );
      await user.click(screen.getByText("Confirm"));

      await waitFor(() =>
        expect(mockUpdateOrganization).toHaveBeenCalledWith("org-1", {
          settings: { model_benchmarking: { run_models_in_parallel: false } },
        }),
      );
    });

    it("saves nothing when the connection check is cancelled", async () => {
      const user = setupUser();
      await pickSequentialAndRun(user, { save: true });
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );

      // Start the comparison on a connection agent opens the connection
      // check, it does not start the comparison. Backing out here means no
      // comparison ever ran, so the workspace must be left alone.
      const check = screen.getByTestId("verify-dialog");
      // Scoped: the picker's own footer has a Cancel too.
      await user.click(within(check).getByText("Cancel"));

      expect(mockUpdateOrganization).not.toHaveBeenCalled();
    });

    it("saves nothing when a model fails its connection check", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: false, error: "no" }),
      });
      const user = setupUser();
      await pickSequentialAndRun(user, { save: true });
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );
      await user.click(screen.getByText("Confirm"));

      await waitFor(() =>
        expect(
          screen.queryByTestId("benchmark-results-dialog"),
        ).not.toBeInTheDocument(),
      );
      expect(mockUpdateOrganization).not.toHaveBeenCalled();
    });

    it("saves nothing when the box is left unticked", async () => {
      const user = setupUser();
      await pickSequentialAndRun(user, { save: false });
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );

      expect(mockUpdateOrganization).not.toHaveBeenCalled();
    });

    it("does not offer to save a choice the workspace already makes", async () => {
      // Nothing to save, so the box is not there to tick.
      mockUseBenchmarkParallelDefault.mockReturnValue(false);
      const user = setupUser();
      render(<BenchmarkDialog {...baseProps(connectionProps)} />);
      await openAdvancedSettings(user);

      expect(screen.getByRole("radio", { name: "Sequential" })).toBeChecked();
      expect(
        screen.queryByRole("checkbox", { name: "Save this as default" }),
      ).not.toBeInTheDocument();
    });

    it("offers to save once the choice differs from the workspace", async () => {
      mockUseBenchmarkParallelDefault.mockReturnValue(false);
      const user = setupUser();
      render(<BenchmarkDialog {...baseProps(connectionProps)} />);
      await openAdvancedSettings(user);
      await user.click(screen.getByRole("radio", { name: "Parallel" }));

      expect(
        screen.getByRole("checkbox", { name: "Save this as default" }),
      ).toBeInTheDocument();
    });

    it("saves nothing when the reader cancels before starting", async () => {
      const user = setupUser();
      await pickSequentialAndRun(user, { save: true });
      await user.click(
        screen.getAllByRole("button", { name: "Cancel" }).slice(-1)[0],
      );

      expect(mockUpdateOrganization).not.toHaveBeenCalled();
    });

    it("starts the comparison even when the default cannot be saved", async () => {
      mockUpdateOrganization.mockRejectedValue(new Error("save failed"));
      (global.fetch as jest.Mock).mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ success: true }),
      });
      const user = setupUser();
      await pickSequentialAndRun(user, { save: true });
      await user.click(
        screen.getByRole("button", { name: "Start the comparison" }),
      );
      await user.click(screen.getByText("Confirm"));

      const payload = JSON.parse(
        (
          await screen.findByTestId("benchmark-results-dialog")
        ).textContent!.split("results-close")[0],
      );
      expect(payload.parallelModels).toBe(false);
      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "The workspace default was not saved.",
        ),
      );
    });
  });
});
