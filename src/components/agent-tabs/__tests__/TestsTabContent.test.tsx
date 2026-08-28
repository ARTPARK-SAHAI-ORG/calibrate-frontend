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
// The tab uses the hook twice (`testId` for the open test, `runId` for the open
// run), so the args are kept per param and this file drives the `testId` one.
let dialogUrlParamArgs: any = null;
const setTestIdParamMock = jest.fn();
// The same, for the `runId` param that names the run being watched.
let runIdParamArgs: any = null;
const setRunIdParamMock = jest.fn();

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
  usePageSize: jest.requireActual("../../../hooks/usePageSize").usePageSize,
  PAGE_SIZE_OPTIONS: jest.requireActual("../../../hooks/usePageSize")
    .PAGE_SIZE_OPTIONS,
  useAgentTests: jest.requireActual("../../../hooks/useAgentTests")
    .useAgentTests,
  useMaxRowsPerEval: () => useMaxRowsPerEvalMock(),
  useDialogUrlParam: (args: any) => {
    if (args.param === "runId") {
      runIdParamArgs = args;
      return { setParam: setRunIdParamMock };
    }
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
        <button
          onClick={() =>
            props.onSubmit(
              {
                input: "What is the capital of France?",
                evaluation: { type: "general" },
              },
              [{ evaluator_uuid: "e1" }],
            )
          }
        >
          SubmitGeneral
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
    // `apiClient` (used by the paged agent-tests fetch) reads the content
    // type and the raw text, not just `json()`.
    headers: new Headers({ "content-type": "application/json" }),
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
const generalTest = {
  uuid: "t4",
  name: "Capital question test",
  description: "",
  type: "general" as const,
  config: { input: "What is the capital of France?" },
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
    // The agent's tests are paged, so the address carries `limit`/`offset`
    // (and `q` while searching); match on the path alone.
    const path = String(url).split("?")[0];
    if (url.includes("/agent-tests/agent/") && path.endsWith("/tests")) {
      if (state.agentTestsInit) {
        return jsonResponse(state.agentTests, state.agentTestsInit);
      }
      // Search, type filter and paging all happen on the backend, so the fake
      // one does them here rather than handing the whole list over.
      const params = new URLSearchParams(String(url).split("?")[1] ?? "");
      // No page size means the whole linked list, which is what Compare
      // models asks for.
      if (!params.get("limit") && state.allAgentTestsInit) {
        return jsonResponse({}, state.allAgentTestsInit);
      }
      const q = (params.get("q") ?? "").toLowerCase();
      const types = (params.get("type") ?? "").split(",").filter(Boolean);
      const matching = state.agentTests.filter((t: any) => {
        if (types.length > 0 && !types.includes(t.type)) return false;
        return !q || t.name.toLowerCase().includes(q);
      });
      const limit = Number(params.get("limit") ?? matching.length);
      const offset = Number(params.get("offset") ?? 0);
      return jsonResponse({
        items: matching.slice(offset, offset + limit),
        total: matching.length,
        limit,
        offset,
      });
    }
    if (url.includes("/agent-tests/agent/") && path.endsWith("/runs")) {
      return jsonResponse(state.pastRuns, state.pastRunsInit);
    }
    // POST /agent-tests/agent/{uuid}/run — starting a run. The component
    // creates the run here first and only then opens the runner dialog.
    if (url.includes("/agent-tests/agent/") && path.endsWith("/run")) {
      return jsonResponse(
        state.startRun ?? { task_id: "task-new" },
        state.startRunInit,
      );
    }
    if (url.includes("/agent-tests/bulk-unlink")) {
      const body = JSON.parse(opts.body);
      if (!state.bulkUnlinkInit) {
        // The tab re-asks for the page after a removal, so the fake backend
        // has to actually drop the rows.
        const removed = new Set<string>(body.test_uuids);
        state.agentTests = state.agentTests.filter(
          (t: any) => !removed.has(t.uuid),
        );
      }
      return jsonResponse(
        state.bulkUnlink ?? {
          deleted_count: body.test_uuids.length,
          message: "unlinked",
        },
        state.bulkUnlinkInit,
      );
    }
    if (url.includes("/agent-tests/bulk-delete-tests")) {
      const body = JSON.parse(opts.body);
      const removed = new Set<string>(body.test_uuids);
      state.agentTests = state.agentTests.filter(
        (t: any) => !removed.has(t.uuid),
      );
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
      return jsonResponse(
        state.agentTestsMutBody ?? {},
        state.agentTestsMutInit,
      );
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
    allAgentTestsInit: null as ResInit | null,
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

    await screen.findByText("Failed to load agent tests");
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

  it("shows the error state when BACKEND_URL is unset", async () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "";
    renderComponent();
    await screen.findByText("Failed to load agent tests");
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

  it("does not offer Add test even when the library has tests", async () => {
    state.allTests = [libraryTest];
    renderComponent();
    await screen.findByText("No tests attached");
    // Attaching an existing test is hidden for now: new tests come from
    // Create test and Bulk upload.
    expect(screen.queryByText("Add test")).not.toBeInTheDocument();
    expect(screen.getByText("Create test")).toBeInTheDocument();
  });
});

describe("TestsTabContent — paging", () => {
  // 12 tests so the smallest page size (10) leaves a second page.
  const manyTests = Array.from({ length: 12 }, (_, i) => ({
    ...responseTest,
    uuid: `p${i + 1}`,
    name: `Paged test ${i + 1}`,
  }));

  beforeEach(() => {
    window.localStorage.setItem("calibrate:items-page-size", "10");
    state.agentTests = manyTests;
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("shows one page at a time and says how many there are in all", async () => {
    renderComponent();
    await screen.findAllByText("Paged test 1");

    expect(screen.getByText("Showing 1–10 of 12 tests")).toBeInTheDocument();
    expect(screen.queryAllByText("Paged test 11")).toHaveLength(0);
  });

  it("turns to the next page and back", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByLabelText("Next page"));
    await screen.findAllByText("Paged test 11");
    expect(screen.getByText("Showing 11–12 of 12 tests")).toBeInTheDocument();
    expect(screen.queryAllByText("Paged test 1")).toHaveLength(0);

    await user.click(screen.getByLabelText("Previous page"));
    await screen.findAllByText("Paged test 1");
  });

  it("clears the ticked rows when the page turns", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText(/tests selected/)).toBeInTheDocument();

    await user.click(screen.getByLabelText("Next page"));
    await screen.findAllByText("Paged test 11");
    expect(screen.queryByText(/tests selected/)).not.toBeInTheDocument();
  });

  it("runs every linked test from Run all, not just the page", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByText("Run all tests"));
    await waitFor(() => expect(runPostCall()).toBeTruthy());
    // No list of test ids at all means "every test linked to this agent".
    expect(JSON.parse(runPostCall()![1].body)).toEqual({});
  });

  it("compares models on every linked test without loading the list", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;

    await user.click(screen.getByTestId("compare-header"));
    await screen.findByTestId("benchmark-dialog");

    // No test ids at all is what tells the backend to run every linked test,
    // so nothing has to be fetched to open this.
    expect(benchmarkProps.tests).toEqual([]);
    expect(benchmarkProps.totalTests).toBe(12);
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it("goes back to the first page after a test is created, where it lands", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByLabelText("Next page"));
    await screen.findByText("Showing 11–12 of 12 tests");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await screen.findByText("Showing 1–10 of 12 tests");
  });

  it("keeps the filters on screen when the chosen type has no tests", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    // Every paged test is a response test, so this finds nothing.
    await user.click(screen.getByRole("button", { name: "Tool Call" }));

    await screen.findByText("No tests match your search");
    // The reader has to be able to get back to All.
    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByText("Run all tests")).toBeInTheDocument();
  });

  it("counts every linked test against the run limit, not the filtered ones", async () => {
    useMaxRowsPerEvalMock.mockReturnValue(5);
    const user = setupUser();
    state.agentTests = [...manyTests, toolCallTest];
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByRole("button", { name: "Tool Call" }));
    await screen.findAllByText("Weather tool test");

    // One test matches the filter, but Run all runs all 13.
    await user.click(screen.getByText("Run all tests"));
    expect(showLimitToast).toHaveBeenCalled();
    expect(runPostCall()).toBeFalsy();
  });

  it("offers every test once the whole page is ticked, and counts them all", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText(/tests selected/)).toHaveTextContent(
      "10 tests selected",
    );

    await user.click(screen.getByText("Select all 12 tests"));
    expect(screen.getByText(/tests selected/)).toHaveTextContent(
      "12 tests selected",
    );
  });

  it("removes every test, not only the page, once all are selected", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Select all 12 tests"));
    await user.click(screen.getByText("Remove"));
    await screen.findByTestId("delete-dialog");
    await user.click(screen.getByText("ConfirmDelete"));

    await waitFor(() => {
      const unlink = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).endsWith("/agent-tests/bulk-unlink"),
      );
      expect(unlink).toBeTruthy();
      expect(JSON.parse(unlink![1].body).test_uuids).toHaveLength(12);
    });
  });

  it("runs every test with no ids when all are selected and nothing is filtered", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Select all 12 tests"));
    await user.click(screen.getByText("Run"));

    await waitFor(() => expect(runPostCall()).toBeTruthy());
    expect(JSON.parse(runPostCall()![1].body)).toEqual({});
  });

  it("names the matching tests when all are selected under a filter", async () => {
    const user = setupUser();
    state.agentTests = [...manyTests, toolCallTest];
    renderComponent();
    await screen.findAllByText("Paged test 1");

    // 13 tests, 12 of them reply tests: the reply filter spans two pages.
    await user.click(screen.getByRole("button", { name: "Agent Response" }));
    await screen.findByText("Showing 1–10 of 12 tests");
    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Select all 12 tests"));
    await user.click(screen.getByText("Run"));

    await waitFor(() => expect(runPostCall()).toBeTruthy());
    // Not every linked test, so the run has to name the 12 that match.
    expect(JSON.parse(runPostCall()![1].body).test_uuids).toHaveLength(12);
  });

  it("drops the across-pages selection when a row is unticked", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Select all 12 tests"));
    await user.click(screen.getAllByTitle("Select test")[0]);

    expect(screen.getByText(/tests selected/)).toHaveTextContent(
      "9 tests selected",
    );
    expect(
      screen.queryByText("Select all 12 tests"),
    ).not.toBeInTheDocument();
  });

  it("asks the backend for the chosen type and keeps the count honest", async () => {
    const user = setupUser();
    state.agentTests = [...manyTests, toolCallTest];
    renderComponent();
    await screen.findAllByText("Paged test 1");

    await user.click(screen.getByRole("button", { name: "Tool Call" }));

    await screen.findAllByText("Weather tool test");
    expect(screen.queryAllByText("Paged test 1")).toHaveLength(0);
    expect(screen.getByText("1 test")).toBeInTheDocument();
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
    expect(screen.getAllByText("Agent Response").length).toBeGreaterThan(0);
  });

  it("asks the backend for the tests matching what was typed", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    // The backend does the searching, so the tab sends `q` and shows whatever
    // comes back rather than filtering the rows it already has.
    state.agentTests = [toolCallTest];
    await user.type(screen.getByPlaceholderText("Search tests"), "Weather");

    await waitFor(() =>
      expect(screen.queryAllByText("Greeting test")).toHaveLength(0),
    );
    expect(screen.getAllByText("Weather tool test")[0]).toBeInTheDocument();
    const searched = (global.fetch as jest.Mock).mock.calls.some(([url]) =>
      String(url).includes("q=Weather"),
    );
    expect(searched).toBe(true);

    // No match → the search-specific empty message, not the setup one.
    state.agentTests = [];
    await user.clear(screen.getByPlaceholderText("Search tests"));
    await user.type(screen.getByPlaceholderText("Search tests"), "zzz");
    await screen.findByText("No tests match your search");
  });

  it("sends the evaluators when a general test is edited", async () => {
    state.agentTests = [generalTest];
    state.testDetail = { ...generalTest, evaluators: [] };
    const user = setupUser();
    renderComponent({ agentNature: "general" });
    await screen.findAllByText("Capital question test");

    await user.click(screen.getAllByText("Capital question test")[0]);
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SubmitGeneral"));

    await waitFor(() => {
      const putCall = (global.fetch as jest.Mock).mock.calls.find(
        (c: any[]) => c[1]?.method === "PUT",
      );
      expect(putCall).toBeTruthy();
      expect(JSON.parse(putCall![1].body).evaluators).toEqual([
        { evaluator_uuid: "e1" },
      ]);
    });
  });

  it("selects all rows and shows the bulk-action toolbar, then clears", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText(/tests selected/)).toBeInTheDocument();
    expect(screen.getByText("Remove")).toBeInTheDocument();
    // Deleting from the library is hidden for now; Remove detaches only.
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();

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

  it("names the run it just started in the address, and clears it on close", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    await screen.findByTestId("test-runner-dialog");
    expect(setRunIdParamMock).toHaveBeenCalledWith("task-new");

    await user.click(screen.getByText("CloseRunner"));
    expect(setRunIdParamMock).toHaveBeenLastCalledWith(null);
  });

  it("reopens the run the address names, so a reload comes back to it", async () => {
    renderComponent();
    await screen.findAllByText("Greeting test");
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();

    await act(async () => {
      runIdParamArgs.onOpen("task-from-address");
    });
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent(
      "task-from-address",
    );

    await act(async () => {
      runIdParamArgs.onClose();
    });
    expect(screen.queryByTestId("test-runner-dialog")).not.toBeInTheDocument();
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
      expect(
        screen.queryByRole("button", { name: "Run" }),
      ).not.toBeInTheDocument(),
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

  it("removes a single test from the agent (POST /agent-tests/bulk-unlink)", async () => {
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
    const unlinkCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => String(c[0]).endsWith("/agent-tests/bulk-unlink"),
    );
    expect(unlinkCalls).toHaveLength(1);
    expect(unlinkCalls[0][1].method).toBe("POST");
    expect(JSON.parse(unlinkCalls[0][1].body)).toEqual({
      agent_uuid: "agent-1",
      test_uuids: [responseTest.uuid],
    });
  });

  it("does not offer to delete a single test from the library", async () => {
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getAllByTitle("Delete test")[0]);
    await screen.findByTestId("delete-dialog");
    // The window only takes the test off this agent now: no checkbox to turn
    // it into a permanent library delete.
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.getByTestId("delete-title")).toHaveTextContent("Remove test");
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

    // One call for the whole selection, not one per test.
    const unlinkCalls = (global.fetch as jest.Mock).mock.calls.filter(
      (c: any[]) => String(c[0]).endsWith("/agent-tests/bulk-unlink"),
    );
    expect(unlinkCalls).toHaveLength(1);
    expect(JSON.parse(unlinkCalls[0][1].body)).toEqual({
      agent_uuid: "agent-1",
      test_uuids: [responseTest.uuid, toolCallTest.uuid],
    });
  });

  it("keeps the tests on screen when the unlink call fails", async () => {
    state.bulkUnlinkInit = { ok: false, status: 500 };
    const user = setupUser();
    renderComponent();
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByTitle("Select all"));
    await user.click(screen.getByText("Remove"));
    await screen.findByTestId("delete-dialog");
    await user.click(screen.getByText("ConfirmDelete"));

    // Wait for the failed call to have been made and settled, then check
    // nothing was taken off the list and the window is still open.
    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.filter((c: any[]) =>
          String(c[0]).endsWith("/agent-tests/bulk-unlink"),
        ),
      ).toHaveLength(1),
    );
    expect(screen.getByTestId("delete-dialog")).toBeInTheDocument();
    expect(screen.getAllByText("Greeting test").length).toBeGreaterThan(0);
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

  it("creates a general test with its input and its evaluators", async () => {
    const user = setupUser();
    renderComponent({ agentNature: "general" });
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitGeneral"));

    await waitFor(() => {
      const bulkCall = (global.fetch as jest.Mock).mock.calls.find((c: any[]) =>
        String(c[0]).endsWith("/tests/bulk"),
      );
      expect(bulkCall).toBeTruthy();
      const item = JSON.parse(bulkCall![1].body).tests[0];
      // Exactly one of the two content fields, and the evaluators must ride
      // along or the test is created with nothing judging it.
      expect(item.input).toBe("What is the capital of France?");
      expect(item).not.toHaveProperty("conversation_history");
      expect(item.evaluators).toEqual([{ evaluator_uuid: "e1" }]);
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

  it("does not blame the test type when the failure body cannot be read", async () => {
    // A 502 that returns an HTML error page says nothing about types.
    // Guessing "your types don't match" sends the reader off to change
    // test types over what is really an outage.
    state.createInit = { ok: false, status: 502 };
    state.createResult = "<html>Bad Gateway</html>";
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await waitFor(() =>
      expect(screen.getByTestId("add-test-error")).toHaveTextContent(
        "Failed to create test",
      ),
    );
    expect(screen.getByTestId("add-test-error")).not.toHaveTextContent(
      /type doesn't match/,
    );
  });

  it("shows a plain-language error when create-and-link fails because the type doesn't match", async () => {
    state.createInit = { ok: false, status: 400 };
    state.createResult = { detail: "interaction_type mismatch" };
    const user = setupUser();
    renderComponent();
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    await user.click(screen.getByText("SetName"));
    await user.click(screen.getByText("SubmitResponse"));

    await waitFor(() =>
      expect(screen.getByTestId("add-test-error")).toHaveTextContent(
        "These tests can't be linked to this agent because their type doesn't match the agent's kind.",
      ),
    );
    expect(screen.getByTestId("add-test-dialog")).toBeInTheDocument();
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

  it("passes agentNature through to the create dialog and bulk-upload modal", async () => {
    const user = setupUser();
    renderComponent({ agentNature: "general" });
    await screen.findByText("No tests attached");

    await user.click(screen.getByText("Bulk upload"));
    await screen.findByTestId("bulk-upload-modal");
    expect(bulkUploadProps.agentNature).toBe("general");
    await user.click(screen.getByText("CloseBulkUpload"));

    await user.click(screen.getByText("Create test"));
    await screen.findByTestId("add-test-dialog");
    expect(addTestDialogProps.agentNature).toBe("general");
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
    // Header compare names no tests, which the backend reads as every test
    // linked to the agent, and says how many that is for the progress count.
    expect(screen.getByTestId("benchmark-test-count")).toHaveTextContent("0");
    expect(benchmarkProps.totalTests).toBe(2);
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

  it("tells the parent when the run window is closed", async () => {
    state.agentTests = [responseTest];
    const onRunWindowClosed = jest.fn();
    const user = setupUser();
    renderComponent({ onRunWindowClosed });
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    await screen.findByTestId("test-runner-dialog");
    // The parent takes the reader to the Evaluations tab from here.
    await act(async () => {
      testRunnerProps.onClose();
    });
    expect(onRunWindowClosed).toHaveBeenCalled();
  });

  it("opens the run dialog and tells the parent a run started", async () => {
    state.agentTests = [responseTest];
    const onRunStarted = jest.fn();
    const user = setupUser();
    renderComponent({ onRunStarted });
    await screen.findAllByText("Greeting test");

    await user.click(screen.getByText("Run all tests"));
    // The runs list lives in the Runs tab now, so this tab only opens the
    // window on the new run and lets the parent refresh that tab.
    await screen.findByTestId("test-runner-dialog");
    expect(onRunStarted).toHaveBeenCalled();
  });
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
