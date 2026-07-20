import React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { signOut } from "next-auth/react";
import { TestsTabContent } from "../TestsTabContent";
import { showLimitToast } from "@/constants/limits";
import { toast } from "sonner";
import {
  readBulkNameConflictMessage,
  readNameConflictMessage,
} from "@/lib/parseBackendError";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const useAccessTokenMock = jest.fn();
const useMaxRowsPerEvalMock = jest.fn();

// Capture the deep-link hook's args (esp. onOpen) and expose a spy setParam so
// we can assert URL writes/clears and drive the "open from URL" path directly.
let dialogUrlParamArgs: any = null;
const setTestIdParamMock = jest.fn();

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
  useMaxRowsPerEval: () => useMaxRowsPerEvalMock(),
  useDialogUrlParam: (args: any) => {
    dialogUrlParamArgs = args;
    return { setParam: setTestIdParamMock };
  },
}));

jest.mock("../../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

jest.mock("../../../constants/limits", () => ({
  __esModule: true,
  showLimitToast: jest.fn(),
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("../../../lib/parseBackendError", () => ({
  __esModule: true,
  readBulkNameConflictMessage: jest.fn(async () => null),
  readNameConflictMessage: jest.fn(async () => null),
}));

// --- Heavy child dialogs / buttons: stub and capture props. ---

let deleteDialogProps: any = null;
jest.mock("../../DeleteConfirmationDialog", () => ({
  __esModule: true,
  DeleteConfirmationDialog: (props: any) => {
    deleteDialogProps = props;
    return props.isOpen ? (
      <div data-testid="delete-dialog">
        <div data-testid="delete-title">{props.title}</div>
        <div data-testid="delete-message">{props.message}</div>
        <div data-testid="delete-confirm-text">{props.confirmText}</div>
        {props.extraContent}
        <button onClick={props.onConfirm}>ConfirmDelete</button>
        <button onClick={props.onClose}>CloseDelete</button>
      </div>
    ) : null;
  },
}));

let addTestDialogProps: any = null;
jest.mock("../../AddTestDialog", () => ({
  __esModule: true,
  AddTestDialog: (props: any) => {
    addTestDialogProps = props;
    return props.isOpen ? (
      <div data-testid="add-test-dialog">
        <div data-testid="add-test-editing">
          {props.isEditing ? "editing" : "creating"}
        </div>
        <div data-testid="add-test-name">{props.testName}</div>
        {props.createError && (
          <div data-testid="add-test-error">{props.createError}</div>
        )}
        {props.nameError && (
          <div data-testid="add-test-name-error">{props.nameError}</div>
        )}
        <button onClick={() => props.setTestName("New Test Name")}>
          SetName
        </button>
        <button
          onClick={() =>
            props.onSubmit({ history: [], evaluation: { type: "response" } }, [
              { evaluator_uuid: "e1" },
            ])
          }
        >
          SubmitResponse
        </button>
        <button
          onClick={() =>
            props.onSubmit(
              {
                history: [],
                evaluation: { type: "tool_call", tool_calls: [] },
              },
              [],
            )
          }
        >
          SubmitToolCall
        </button>
        <button onClick={props.onClose}>CloseAddTest</button>
      </div>
    ) : null;
  },
}));

let bulkUploadProps: any = null;
jest.mock("../../BulkUploadTestsModal", () => ({
  __esModule: true,
  BulkUploadTestsModal: (props: any) => {
    bulkUploadProps = props;
    return props.isOpen ? (
      <div data-testid="bulk-upload-modal">
        <button onClick={props.onSuccess}>BulkUploadSuccess</button>
        <button onClick={props.onClose}>CloseBulkUpload</button>
      </div>
    ) : null;
  },
}));

let testRunnerProps: any = null;
jest.mock("../../TestRunnerDialog", () => ({
  __esModule: true,
  TestRunnerDialog: (props: any) => {
    testRunnerProps = props;
    return props.isOpen ? (
      <div data-testid="test-runner-dialog">
        {/* The dialog is a pure viewer now: it only knows the run id. */}
        <div data-testid="runner-task-id">{props.taskId}</div>
        <button onClick={() => props.onNewRun?.("task-rerun", ["t1", "t2"])}>
          TriggerNewRun
        </button>
        <button onClick={props.onClose}>CloseRunner</button>
      </div>
    ) : null;
  },
}));

let benchmarkProps: any = null;
jest.mock("../../BenchmarkDialog", () => ({
  __esModule: true,
  BenchmarkDialog: (props: any) => {
    benchmarkProps = props;
    return props.isOpen ? (
      <div data-testid="benchmark-dialog">
        <div data-testid="benchmark-test-count">{props.tests.length}</div>
        <button onClick={() => props.onBenchmarkCreated?.("bench-1")}>
          TriggerBenchmarkCreated
        </button>
        <button onClick={props.onClose}>CloseBenchmark</button>
      </div>
    ) : null;
  },
}));

let benchmarkResultsProps: any = null;
jest.mock("../../BenchmarkResultsDialog", () => ({
  __esModule: true,
  BenchmarkResultsDialog: (props: any) => {
    benchmarkResultsProps = props;
    return props.isOpen ? (
      <div data-testid="benchmark-results-dialog">
        <button onClick={props.onClose}>CloseBenchmarkResults</button>
      </div>
    ) : null;
  },
}));

jest.mock("../CompareModelsButton", () => ({
  __esModule: true,
  CompareModelsButton: (props: any) => (
    <button data-testid={`compare-${props.size}`} onClick={props.onClick}>
      Compare-{props.size}
    </button>
  ),
}));

// ---------------------------------------------------------------------------
// fetch router
// ---------------------------------------------------------------------------

type ResInit = { ok?: boolean; status?: number };
function jsonResponse(body: any, init: ResInit = {}) {
  const { ok = true, status = 200 } = init;
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    clone() {
      return this;
    },
  } as unknown as Response;
}

const responseTest = {
  uuid: "t1",
  name: "Greeting test",
  description: "",
  type: "response" as const,
  config: {},
  created_at: "2026-01-01 09:00:00",
  updated_at: "2026-01-01 09:00:00",
};
const toolCallTest = {
  uuid: "t2",
  name: "Weather tool test",
  description: "",
  type: "tool_call" as const,
  config: {},
  created_at: "2026-01-01 09:00:00",
  updated_at: "2026-01-01 09:00:00",
};
const libraryTest = {
  uuid: "t3",
  name: "Library only test",
  description: "",
  type: "response" as const,
  config: {},
  created_at: "2026-01-01 09:00:00",
  updated_at: "2026-01-01 09:00:00",
};

let state: any;

function installFetch() {
  global.fetch = jest.fn(async (url: string, opts: any = {}) => {
    const method = opts.method || "GET";
    if (url.includes("/agent-tests/agent/") && url.endsWith("/tests")) {
      return jsonResponse(state.agentTests, state.agentTestsInit);
    }
    if (url.includes("/agent-tests/agent/") && url.endsWith("/runs")) {
      return jsonResponse(state.pastRuns, state.pastRunsInit);
    }
    // POST /agent-tests/agent/{uuid}/run — starting a run. The component
    // creates the run here first and only then opens the runner dialog.
    if (url.includes("/agent-tests/agent/") && url.endsWith("/run")) {
      return jsonResponse(
        state.startRun ?? { task_id: "task-new" },
        state.startRunInit,
      );
    }
    if (url.includes("/agent-tests/bulk-delete-tests")) {
      const body = JSON.parse(opts.body);
      return jsonResponse(
        state.bulkDelete ?? {
          deleted_count: body.test_uuids.length,
          deleted_test_uuids: body.test_uuids,
        },
        state.bulkDeleteInit,
      );
    }
    if (url.includes("/agent-tests/run/")) {
      return jsonResponse(state.pollUnit, state.pollInit);
    }
    if (url.includes("/agent-tests/benchmark/")) {
      return jsonResponse(state.pollBench, state.pollInit);
    }
    if (url.endsWith("/agent-tests")) {
      return jsonResponse({}, state.agentTestsMutInit);
    }
    if (url.endsWith("/tests/bulk")) {
      return jsonResponse(state.createResult ?? {}, state.createInit);
    }
    if (url.includes("/agents/") && url.endsWith("/evaluators")) {
      if (method === "PUT") {
        return jsonResponse(
          state.setAgentEvaluatorsResult ?? {
            evaluator_ids: [],
            linked: [],
            unlinked: [],
          },
        );
      }
      const items = state.agentEvaluators ?? [
        {
          uuid: "e1",
          name: "Accuracy",
          description: "d",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_default: true,
          evaluator_type: "llm",
        },
      ];
      return jsonResponse({
        items,
        total: items.length,
        limit: 100,
        offset: 0,
      });
    }
    if (url.includes("/evaluators?include_defaults=true")) {
      const items = state.allEvaluators ?? [
        {
          uuid: "e1",
          name: "Accuracy",
          description: "d",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_default: true,
          evaluator_type: "llm",
        },
      ];
      return jsonResponse({
        items,
        total: items.length,
        limit: 100,
        offset: 0,
      });
    }
    if (url.endsWith("/tests")) {
      return jsonResponse(state.allTests, state.allTestsInit);
    }
    if (url.includes("/tests/")) {
      if (method === "PUT") return jsonResponse({}, state.updateInit);
      return jsonResponse(state.testDetail, state.detailInit);
    }
    return jsonResponse({});
  }) as any;
}

// The single POST that starts a run, for body assertions.
function runPostCall() {
  return (global.fetch as jest.Mock).mock.calls.find(
    ([url, init]) =>
      init?.method === "POST" &&
      String(url).endsWith("/agent-tests/agent/agent-1/run"),
  );
}

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof TestsTabContent>> = {},
) {
  return render(<TestsTabContent agentUuid="agent-1" {...overrides} />);
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com";
  useAccessTokenMock.mockReturnValue("token-123");
  useMaxRowsPerEvalMock.mockReturnValue(100);
  deleteDialogProps = null;
  addTestDialogProps = null;
  dialogUrlParamArgs = null;
  setTestIdParamMock.mockClear();
  bulkUploadProps = null;
  testRunnerProps = null;
  benchmarkProps = null;
  benchmarkResultsProps = null;
  (signOut as jest.Mock).mockClear();
  (showLimitToast as jest.Mock).mockClear();
  (readBulkNameConflictMessage as jest.Mock).mockResolvedValue(null);
  (readNameConflictMessage as jest.Mock).mockResolvedValue(null);
  state = {
    agentTests: [],
    pastRuns: [],
    allTests: [],
    testDetail: {
      ...responseTest,
      evaluators: [
        {
          uuid: "e1",
          name: "Accuracy",
          description: "d",
          slug: "accuracy",
          variables: [],
          variable_values: {},
        },
      ],
    },
  };
  installFetch();
});

afterEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TestsTabContent — load states", () => {
  it("shows a loading spinner while agent tests are being fetched", async () => {
    // Never-resolving fetch keeps the component in the loading state.
    global.fetch = jest.fn(() => new Promise(() => {})) as any;
    const { container } = renderComponent();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders an error state with a working Retry button", async () => {
    state.agentTestsInit = { ok: false, status: 500 };
    const reloadMock = jest.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, reload: reloadMock },
    });
    const user = setupUser();
    renderComponent();

    await screen.findByText("Failed to fetch agent tests");
    await user.click(screen.getByText("Retry"));
    expect(reloadMock).toHaveBeenCalled();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("signs out on a 401 from the agent-tests fetch", async () => {
    state.agentTestsInit = { ok: false, status: 401 };
    renderComponent();
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("does not fetch when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    renderComponent();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("throws (surfaces error) when BACKEND_URL is unset", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    renderComponent();
    await screen.findByText("BACKEND_URL environment variable is not set");
  });
});

describe("TestsTabContent — empty states", () => {
  it("shows the empty state with CSV copy when the library is also empty", async () => {
    renderComponent();
    await screen.findByText("No tests attached");
    // Copy only switches to the CSV variant after the /tests library fetch
    // resolves and confirms the library is empty.
    await screen.findByText(/upload tests from a CSV file to get started/);
    // Create + Bulk upload always present; Add test hidden (library empty).
    expect(screen.getByText("Create test")).toBeInTheDocument();
    expect(screen.getByText("Bulk upload")).toBeInTheDocument();
    expect(screen.queryByText("Add test")).not.toBeInTheDocument();
  });

  it("shows the Add-test button in the empty state when the library has tests", async () => {
    state.allTests = [libraryTest];
    renderComponent();
    await screen.findByText("No tests attached");
    await screen.findByText("Add test");
  });

  it("shows the with-past-runs empty variant and the past runs panel", async () => {
    state.pastRuns = [
      {
        uuid: "run-1",
        name: "",
        status: "completed",
        type: "llm-unit-test",
        updated_at: "2026-01-01 09:00:00",
        total_tests: 3,
        passed: 3,
        failed: 0,
        results: null,
      },
    ];
    renderComponent();
    await screen.findByText("No tests attached");
    expect(
      screen.getByText(/doesn't have any tests linked right now/),
    ).toBeInTheDocument();
    expect(screen.getByText("Past runs")).toBeInTheDocument();
    expect(screen.getByText("3 tests")).toBeInTheDocument();
  });
});

describe("TestsTabContent — populated table", () => {
  beforeEach(() => {
    state.agentTests = [responseTest, toolCallTest];
  });

  it("renders the tests table with names, count and type labels", async () => {
    renderComponent();
    await screen.findAllByText("Greeting test");
    expect(screen.getAllByText("Weather tool test")[0]).toBeInTheDocument();
    expect(screen.getByText("2 tests")).toBeInTheDocument();
    expect(screen.getAllByText("Next Reply").length).toBeGreaterThan(0);
  });

  it("filters the list via the search input", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.type(screen.getByPlaceholderText("Search tests"), "Weather");
    expect(screen.queryAllByText("Greeting test")).toHaveLength(0);
    expect(screen.getAllByText("Weather tool test")[0]).toBeInTheDocument();

    // No match → empty message.
    await user.clear(screen.getByPlaceholderText("Search tests"));
    await user.type(screen.getByPlaceholderText("Search tests"), "zzz");
    expect(screen.getByText("No tests match your search")).toBeInTheDocument();
  });

  it("filters the list by test type", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    // "Tool Call" also appears as a type label in the table, so scope to the
    // filter's button role.
    await user.click(screen.getByRole("button", { name: "Tool Call" }));
    expect(screen.queryAllByText("Greeting test")).toHaveLength(0);
    expect(screen.getAllByText("Weather tool test")[0]).toBeInTheDocument();
  });

  it("selects all rows and shows the bulk-action toolbar, then clears", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/tests selected/)).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
    expect(screen.getByText("Delete")).toBeInTheDocument();

    await user.click(screen.getByText("Clear"));
    expect(screen.queryByText(/tests selected/)).not.toBeInTheDocument();
  });

  it("selects a single row via its checkbox", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    const rowCheckboxes = screen.getAllByTitle("Select test");
    await user.click(rowCheckboxes[0]);
    expect(screen.getByText(/test selected/)).toBeInTheDocument();
  });

  it("opens the edit dialog when a row is clicked (fetches detail)", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByText("Greeting test")[0]);
    await screen.findByTestId("add-test-dialog");
    expect(screen.getByTestId("add-test-editing")).toHaveTextContent("editing");
  });

  it("saves an edit via PUT /tests/{uuid}", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByText("Greeting test")[0]);
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SubmitResponse"));

    await waitFor(() => {
      const putCall = (global.fetch as jest.Mock).mock.calls.find(
        (c: any[]) => c[1]?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
    });
  });

  it("shows an inline name-conflict error when the edit hits a conflict", async () => {
    (readNameConflictMessage as jest.Mock).mockResolvedValue("conflict");
    state.updateInit = { ok: false, status: 409 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByText("Greeting test")[0]);
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SubmitResponse"));

    await screen.findByTestId("add-test-name-error");
  });

  it("duplicates a test into the create dialog (prefilled, not editing)", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Duplicate test")[0]);
    await screen.findByTestId("add-test-dialog");
    expect(screen.getByTestId("add-test-editing")).toHaveTextContent(
      "creating",
    );
    expect(screen.getByTestId("add-test-name")).toHaveTextContent(
      "Copy of Greeting test",
    );
  });

  it("runs a single test via its row Run button — POSTs just that test's uuid", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Run test")[0]);
    await screen.findByTestId("test-runner-dialog");
    expect(JSON.parse(runPostCall()[1].body)).toEqual({ test_uuids: ["t1"] });
    // The dialog views the run the POST just created.
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent("task-new");
  });

  it("runs all tests from the header button — POSTs no test_uuids", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    await screen.findByTestId("test-runner-dialog");
    // Run-all-linked sends an empty body; the backend reads the link table.
    expect(JSON.parse(runPostCall()[1].body)).toEqual({});
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent("task-new");
  });

  it("runs the selected tests from the bulk toolbar", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Run"));
    await screen.findByTestId("test-runner-dialog");
    expect(JSON.parse(runPostCall()[1].body)).toEqual({
      test_uuids: ["t1", "t2"],
    });
  });

  it("does not open the runner and shows an error toast when starting the run fails", async () => {
    state.startRunInit = { ok: false, status: 500 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
  });

  it("signs out and does not open the runner on a 401 from the run POST", async () => {
    state.startRunInit = { ok: false, status: 401 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("shows a limit toast when running more tests than allowed", async () => {
    useMaxRowsPerEvalMock.mockReturnValue(1);
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    expect(showLimitToast).toHaveBeenCalled();
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Double-click guard: creating a run is a real, billed call, so every run
// control locks while one POST is in flight and only the clicked one spins.
// ---------------------------------------------------------------------------

describe("TestsTabContent — run controls while a run is starting", () => {
  // Holds the run POST open so the in-flight state can be observed.
  let releaseRunPost: (() => void) | null = null;

  beforeEach(() => {
    state.agentTests = [responseTest, toolCallTest];
    releaseRunPost = null;
    const routedFetch = global.fetch as jest.Mock;
    global.fetch = jest.fn(async (url: string, opts: RequestInit = {}) => {
      if (
        opts.method === "POST" &&
        String(url).endsWith("/agent-tests/agent/agent-1/run")
      ) {
        await new Promise<void>((resolve) => {
          releaseRunPost = resolve;
        });
      }
      return routedFetch(url, opts);
    }) as unknown as typeof fetch;
  });

  // The row Run buttons render twice per test (desktop table + mobile card).
  const runTestButtons = () => screen.getAllByTitle("Run test");
  const runAllButton = () =>
    screen.getByText("Run all tests").closest("button") as HTMLButtonElement;

  async function release() {
    await act(async () => {
      releaseRunPost?.();
      await Promise.resolve();
    });
  }

  it("disables every run control and spins the clicked row button", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    const clicked = runTestButtons()[0];
    await user.click(clicked);

    await waitFor(() => expect(clicked).toBeDisabled());
    expect(clicked.querySelector(".animate-spin")).toBeInTheDocument();
    // Every other run control locks too, so a second run cannot be started
    // from a different button.
    runTestButtons()
      .slice(1)
      .forEach((btn) => expect(btn).toBeDisabled());
    expect(runAllButton()).toBeDisabled();
    // Only the clicked control spins.
    expect(
      runTestButtons()[1].querySelector(".animate-spin"),
    ).not.toBeInTheDocument();

    await release();
    await screen.findByTestId("test-runner-dialog");
    await waitFor(() => expect(runAllButton()).not.toBeDisabled());
    runTestButtons().forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("does not start a second run when a row button is clicked twice", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    const clicked = runTestButtons()[0];
    await user.click(clicked);
    await waitFor(() => expect(clicked).toBeDisabled());
    // Same button again, and a sibling control, while the first POST is open.
    await user.click(clicked);
    await user.click(runAllButton());

    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) =>
          init?.method === "POST" &&
          String(url).endsWith("/agent-tests/agent/agent-1/run"),
      ),
    ).toHaveLength(1);

    await release();
  });

  it("spins the header Run all button and re-enables it after the run starts", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(runAllButton());
    await waitFor(() => expect(runAllButton()).toBeDisabled());
    expect(runAllButton().querySelector(".animate-spin")).toBeInTheDocument();
    runTestButtons().forEach((btn) => expect(btn).toBeDisabled());

    await release();
    await screen.findByTestId("test-runner-dialog");
    await waitFor(() => expect(runAllButton()).not.toBeDisabled());
    expect(
      runAllButton().querySelector(".animate-spin"),
    ).not.toBeInTheDocument();
  });

  it("disables the bulk Run button while another run is starting", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    // Start a run from a row, then open the bulk toolbar: its Run button is
    // locked too, so the in-flight POST cannot be doubled from there.
    await user.click(runTestButtons()[0]);
    await waitFor(() => expect(runTestButtons()[0]).toBeDisabled());
    await user.click(screen.getByTitle("Select all"));

    const bulkRun = screen.getByRole("button", { name: "Run" });
    expect(bulkRun).toBeDisabled();
    await user.click(bulkRun);
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) =>
          init?.method === "POST" &&
          String(url).endsWith("/agent-tests/agent/agent-1/run"),
      ),
    ).toHaveLength(1);

    await release();
    await screen.findByTestId("test-runner-dialog");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Run" })).not.toBeDisabled(),
    );
  });

  it("re-enables the run controls after a failed run POST", async () => {
    state.startRunInit = { ok: false, status: 500 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(runAllButton());
    await waitFor(() => expect(runAllButton()).toBeDisabled());

    await release();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    await waitFor(() => expect(runAllButton()).not.toBeDisabled());
    runTestButtons().forEach((btn) => expect(btn).not.toBeDisabled());
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
  });

  it("keeps the bulk toolbar up and spins its own button while the bulk run starts", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByRole("button", { name: "Run" }));

    // The ticks are not cleared yet, so the bar is still shown and its own
    // button is marked busy while the single POST is in flight.
    const bulkRun = screen.getByRole("button", { name: "Run" });
    expect(bulkRun).toBeInTheDocument();
    expect(bulkRun).toHaveAttribute("aria-busy", "true");
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url, init]) =>
          init?.method === "POST" &&
          String(url).endsWith("/agent-tests/agent/agent-1/run"),
      ),
    ).toHaveLength(1);

    // Once the run has started, the ticks clear and the bar goes away.
    await release();
    await screen.findByTestId("test-runner-dialog");
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Run" })).not.toBeInTheDocument(),
    );
  });

  it("keeps the selection when the bulk run fails", async () => {
    state.startRunInit = { ok: false, status: 500 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByRole("button", { name: "Run" }));

    await release();
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    // The run did not start, so the ticks are kept and the bar stays for a
    // retry rather than silently clearing.
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
  });
});

describe("TestsTabContent — test deep-link (?testId)", () => {
  beforeEach(() => {
    state.agentTests = [responseTest, toolCallTest];
  });

  it("writes the test uuid to the URL when a row is opened", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByText("Greeting test")[0]);
    await screen.findByTestId("add-test-dialog");
    expect(setTestIdParamMock).toHaveBeenCalledWith("t1");
  });

  it("opens the test named by the deep-link (onOpen) in edit mode", async () => {
    renderComponent();
    await screen.findAllByText("Greeting test");

    // Simulate the hook resolving a `?testId=t1` URL on load.
    expect(typeof dialogUrlParamArgs.onOpen).toBe("function");
    await act(async () => {
      dialogUrlParamArgs.onOpen("t1");
    });
    await screen.findByTestId("add-test-dialog");
    expect(screen.getByTestId("add-test-editing")).toHaveTextContent("editing");
  });

  it("closes the dialog when the Back button clears the param (onClose)", async () => {
    renderComponent();
    await screen.findAllByText("Greeting test");

    await act(async () => {
      dialogUrlParamArgs.onOpen("t1");
    });
    await screen.findByTestId("add-test-dialog");

    // Simulate Back removing `?testId` — the hook fires onClose.
    expect(typeof dialogUrlParamArgs.onClose).toBe("function");
    await act(async () => {
      dialogUrlParamArgs.onClose();
    });
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
  });

  it("clears the testId from the URL when the dialog is closed", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByText("Greeting test")[0]);
    await screen.findByTestId("add-test-dialog");
    setTestIdParamMock.mockClear();

    await user.click(screen.getByText("CloseAddTest"));
    expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument();
    expect(setTestIdParamMock).toHaveBeenCalledWith(null);
  });

  it("drops a stale testId from the URL when the test detail fetch fails", async () => {
    state.detailInit = { ok: false, status: 500 };
    renderComponent();
    await screen.findAllByText("Greeting test");

    await act(async () => {
      dialogUrlParamArgs.onOpen("does-not-exist");
    });
    await screen.findByTestId("add-test-error");
    expect(setTestIdParamMock).toHaveBeenCalledWith(null);
  });

  it("gates the deep-link on the access token being present", () => {
    renderComponent();
    expect(dialogUrlParamArgs.param).toBe("testId");
    expect(dialogUrlParamArgs.enabled).toBe(true);
  });

  it("disables the deep-link when there is no access token", () => {
    useAccessTokenMock.mockReturnValue(null);
    renderComponent();
    expect(dialogUrlParamArgs.enabled).toBe(false);
  });
});

describe("TestsTabContent — delete flows", () => {
  beforeEach(() => {
    state.agentTests = [responseTest, toolCallTest];
  });

  it("removes a single test from the agent (DELETE /agent-tests)", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Delete test")[0]);
    await screen.findByTestId("delete-dialog");
    expect(screen.getByTestId("delete-title")).toHaveTextContent("Remove test");
    await user.click(screen.getByText("ConfirmDelete"));

    await waitFor(() =>
      expect(screen.queryAllByText("Greeting test")).toHaveLength(0),
    );
    const deleteCall = (global.fetch as jest.Mock).mock.calls.find(
      (c: any[]) =>
        c[1]?.method === "DELETE" && String(c[0]).endsWith("/agent-tests"),
    );
    expect(deleteCall).toBeTruthy();
  });

  it("permanently deletes a single test via the dialog checkbox", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Delete test")[0]);
    await screen.findByTestId("delete-dialog");
    // Toggle the "delete permanently" checkbox rendered inside extraContent.
    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByTestId("delete-title")).toHaveTextContent("Delete test");
    await user.click(screen.getByText("ConfirmDelete"));

    await waitFor(() => {
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).includes("/agent-tests/bulk-delete-tests"),
      );
      expect(bulkCall).toBeTruthy();
    });
  });

  it("bulk-removes selected tests", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Remove"));
    await screen.findByTestId("delete-dialog");
    expect(screen.getByTestId("delete-title")).toHaveTextContent(
      "Remove tests",
    );
    await user.click(screen.getByText("ConfirmDelete"));

    await waitFor(() =>
      expect(screen.queryAllByText("Greeting test")).toHaveLength(0),
    );
  });

  it("bulk-deletes selected tests permanently", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Delete"));
    await screen.findByTestId("delete-dialog");
    expect(screen.getByTestId("delete-title")).toHaveTextContent(
      "Delete tests permanently",
    );
    await user.click(screen.getByText("ConfirmDelete"));

    await waitFor(() => {
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).includes("/agent-tests/bulk-delete-tests"),
      );
      expect(bulkCall).toBeTruthy();
    });
  });

  it("closes the delete dialog via Cancel/Close", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Delete test")[0]);
    await screen.findByTestId("delete-dialog");
    await user.click(screen.getByText("CloseDelete"));
    expect(screen.queryByTestId("delete-dialog")).not.toBeInTheDocument();
  });
});

describe("TestsTabContent — create / bulk upload / attach", () => {
  it("creates a test in-place via POST /tests/bulk", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await waitFor(() => {
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).endsWith("/tests/bulk"),
      );
      expect(bulkCall).toBeTruthy();
    });
    await waitFor(() =>
      expect(screen.queryByTestId("add-test-dialog")).not.toBeInTheDocument(),
    );
  });

  it("creates a tool-call test (tool_calls branch) via POST /tests/bulk", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitToolCall"));

    await waitFor(() => {
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).endsWith("/tests/bulk"),
      );
      expect(bulkCall).toBeTruthy();
    });
  });

  it("shows a name-conflict error when create hits a conflict", async () => {
    (readBulkNameConflictMessage as jest.Mock).mockResolvedValue("conflict");
    state.createInit = { ok: false, status: 400 };
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await screen.findByTestId("add-test-name-error");
  });

  it("keeps the dialog open and shows a warning on partial attach failure", async () => {
    state.createResult = { warnings: ["could not link"] };
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await screen.findByTestId("add-test-error");
    expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();
  });

  it("opens the bulk-upload modal and refetches on success", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Bulk upload"));
    await screen.findByTestId("bulk-upload-modal");
    expect(bulkUploadProps.lockedAgentUuid).toBe("agent-1");
    await user.click(screen.getByText("BulkUploadSuccess"));
    await user.click(screen.getByText("CloseBulkUpload"));
    expect(screen.queryByTestId("bulk-upload-modal")).not.toBeInTheDocument();
  });

  it("attaches existing tests via the Add-test dropdown", async () => {
    state.allTests = [libraryTest];
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(await screen.findByText("Add test"));
    // dropdown search input appears
    await screen.findByPlaceholderText("Search tests");
    await user.click(await screen.findByText("Library only test"));
    await user.click(screen.getByText("Add 1 test"));

    await waitFor(() => {
      const postCall = (global.fetch as jest.Mock).mock.calls.find(
        (c: any[]) =>
          c[1]?.method === "POST" && String(c[0]).endsWith("/agent-tests"),
      );
      expect(postCall).toBeTruthy();
    });
  });

  it("select-all in the dropdown selects every available test", async () => {
    state.allTests = [
      libraryTest,
      { ...libraryTest, uuid: "t4", name: "Second lib" },
    ];
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(await screen.findByText("Add test"));
    await screen.findByText("Select all");
    await user.click(screen.getByText("Select all"));
    expect(screen.getByText("Add 2 tests")).toBeInTheDocument();
  });
});

describe("TestsTabContent — benchmark & past runs", () => {
  it("opens the benchmark dialog from the header Compare button", async () => {
    state.agentTests = [responseTest, toolCallTest];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTestId("compare-header"));
    await screen.findByTestId("benchmark-dialog");
    // Header compare passes all agent tests.
    expect(screen.getByTestId("benchmark-test-count")).toHaveTextContent("2");
  });

  it("opens the benchmark dialog scoped to selected tests (bulk Compare)", async () => {
    state.agentTests = [responseTest, toolCallTest];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    const rowCheckboxes = screen.getAllByTitle("Select test");
    await user.click(rowCheckboxes[0]);
    await user.click(screen.getByTestId("compare-bulk"));
    await screen.findByTestId("benchmark-dialog");
    expect(screen.getByTestId("benchmark-test-count")).toHaveTextContent("1");
  });

  it("adds an optimistic run when a benchmark is created", async () => {
    state.agentTests = [responseTest];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTestId("compare-header"));
    await screen.findByTestId("benchmark-dialog");
    await user.click(screen.getByText("TriggerBenchmarkCreated"));
    // A benchmark run row appears in the past runs list. The optimistic run
    // has no model_results yet, so it renders "0 models".
    await screen.findByText("0 models");
  });

  it("adds an optimistic run as soon as a test run is created", async () => {
    state.agentTests = [responseTest];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    // The pending row is added by the parent when the POST returns, before
    // (and independently of) the dialog reporting anything back.
    await screen.findByText("Running");
    await screen.findByTestId("test-runner-dialog");
  });

  it("renders past-run status pills (breakdown, error, complete)", async () => {
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-breakdown",
        name: "",
        status: "completed",
        type: "llm-unit-test",
        updated_at: "2026-01-01 09:00:00",
        total_tests: 3,
        passed: 1,
        failed: 1,
        results: [
          { passed: true },
          { passed: false },
          { passed: null, status: "error", error: "boom" },
        ],
      },
      {
        uuid: "run-bench-failed",
        name: "Bench",
        status: "failed",
        type: "llm-benchmark",
        updated_at: "2026-01-01 09:00:00",
        total_tests: null,
        passed: null,
        failed: null,
        model_results: [{ model: "a" }, { model: "b" }],
      },
    ];
    renderComponent();
    await screen.findAllByText("Greeting test");

    expect(screen.getByText("1 Success")).toBeInTheDocument();
    expect(screen.getByText("1 Fail")).toBeInTheDocument();
    expect(screen.getByText("1 Error")).toBeInTheDocument();
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByText("2 models")).toBeInTheDocument();
  });

  it("opens the unit-test results dialog when a past run row is clicked", async () => {
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-unit",
        name: "",
        status: "completed",
        type: "llm-unit-test",
        updated_at: "2026-01-01 09:00:00",
        total_tests: 2,
        passed: 2,
        failed: 0,
        results: [
          { passed: true, test_case: { name: "A" } },
          { passed: true, test_case: { name: "B" } },
        ],
      },
    ];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    // agentTests has 1 test ("1 test" count), so the run row's "2 tests"
    // label is unambiguous.
    await user.click(screen.getByText("2 tests"));
    await screen.findByTestId("test-runner-dialog");
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-unit");
  });

  it("opens the benchmark results dialog when a benchmark run row is clicked", async () => {
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-bench",
        name: "Bench",
        status: "completed",
        type: "llm-benchmark",
        updated_at: "2026-01-01 09:00:00",
        total_tests: null,
        passed: null,
        failed: null,
        model_results: [{ model: "a" }],
      },
    ];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("1 model"));
    await screen.findByTestId("benchmark-results-dialog");
  });

  it("switches to the new run and prepends its row when the dialog reports a rerun (onNewRun)", async () => {
    // The dialog now creates the rerun itself and hands the parent the new run
    // id + the tests it ran; the parent shows the pending row and re-points the
    // dialog at that run.
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-unit",
        name: "",
        status: "completed",
        type: "llm-unit-test",
        updated_at: "2026-01-01 09:00:00",
        total_tests: 2,
        passed: 2,
        failed: 0,
        results: [
          { passed: true, test_case: { name: "A" } },
          { passed: true, test_case: { name: "B" } },
        ],
      },
    ];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("2 tests"));
    await screen.findByTestId("test-runner-dialog");
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-unit");
    expect(screen.queryByText("Running")).not.toBeInTheDocument();

    await act(async () => {
      testRunnerProps.onNewRun("task-rerun", ["t1"]);
    });

    // Same single dialog, now viewing the new run, plus a pending row for it.
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent(
      "task-rerun",
    );
    await screen.findByText("Running");
  });

  it("reruns a benchmark: opens a direct benchmark dialog with the given models, no picker", async () => {
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-bench",
        name: "Bench",
        status: "completed",
        type: "llm-benchmark",
        updated_at: "2026-01-01 09:00:00",
        total_tests: null,
        passed: null,
        failed: null,
        model_results: [{ model: "a" }],
      },
    ];
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("1 model"));
    await screen.findByTestId("benchmark-results-dialog");

    await act(async () => {
      benchmarkResultsProps.onRerun(
        ["gpt-4", "claude"],
        ["tu-1", "tu-2"],
        ["A", "B"],
      );
    });

    await screen.findByTestId("benchmark-results-dialog");
    // The direct-rerun instance carries the models/test subset/testNames and no
    // taskId, so it POSTs a fresh benchmark rather than viewing an existing one.
    expect(benchmarkResultsProps.taskId).toBeUndefined();
    expect(benchmarkResultsProps.models).toEqual(["gpt-4", "claude"]);
    expect(benchmarkResultsProps.testUuids).toEqual(["tu-1", "tu-2"]);
    expect(benchmarkResultsProps.testNames).toEqual(["A", "B"]);
    expect(typeof benchmarkResultsProps.onBenchmarkCreated).toBe("function");
  });

  it("polls a pending run and updates its status", async () => {
    state.agentTests = [responseTest];
    state.pastRuns = [
      {
        uuid: "run-pending",
        name: "",
        status: "pending",
        type: "llm-unit-test",
        updated_at: "2026-01-01 09:00:00",
        total_tests: 1,
        passed: null,
        failed: null,
        results: [{ passed: null }],
      },
    ];
    state.pollUnit = {
      status: "completed",
      total_tests: 1,
      passed: 1,
      failed: 0,
      results: [{ passed: true }],
    };
    renderComponent();
    await screen.findAllByText("Greeting test");
    // The poll runs on the POLLING_INTERVAL_MS (3s) interval and flips the
    // pending run to completed, surfacing the per-test breakdown.
    await screen.findByText("1 Success", {}, { timeout: 5000 });
  }, 10000);
});

describe("TestsTabContent — connection agent", () => {
  it("opens the verify window from Run all for an unverified connection agent", async () => {
    const user = setupUser();
    state.agentTests = [responseTest];
    renderComponent({
      agentType: "connection",
      connectionVerified: false,
    });
    await screen.findAllByText("Greeting test");
    const runAll = screen.getByText("Run all tests").closest("button")!;
    // No longer disabled — clicking now prompts to verify the connection first.
    expect(runAll).toBeEnabled();
    await user.click(runAll);
    expect(screen.getByText("Verify connection")).toBeInTheDocument();
  });
});
