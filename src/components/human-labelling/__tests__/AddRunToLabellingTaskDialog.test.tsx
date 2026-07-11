import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  AddRunToLabellingTaskDialog,
  buildItemsFromSource,
  isLabellingEligibleRaw,
  type AddRunToLabellingTaskSource,
} from "../AddRunToLabellingTaskDialog";

const apiClientMock = jest.fn();
const unwrapListMock = jest.fn();
jest.mock("../../../lib/api", () => ({
  apiClient: (...args: unknown[]) => apiClientMock(...args),
  unwrapList: (...args: unknown[]) => unwrapListMock(...args),
}));

const reportErrorMock = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportErrorMock(...args),
}));

const useAccessTokenMock = jest.fn();
jest.mock("../../../hooks/useAccessToken", () => ({
  useAccessToken: () => useAccessTokenMock(),
}));

describe("buildItemsFromSource / isLabellingEligibleRaw", () => {
  it("treats only response-type test cases as eligible", () => {
    expect(
      isLabellingEligibleRaw({ test_case: { evaluation: { type: "response" } } }),
    ).toBe(true);
    expect(
      isLabellingEligibleRaw({ test_case: { evaluation: { type: "tool_call" } } }),
    ).toBe(false);
    expect(isLabellingEligibleRaw({})).toBe(false);
  });

  it("builds items from a test_run source, skipping ineligible tests", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "test_run",
      runUuid: "run-uuid-12345678",
      results: [
        {
          test_case: {
            name: "Greeting",
            evaluation: { type: "response" },
            config: { history: [{ role: "user", content: "hi" }] },
            evaluators: [
              { evaluator_uuid: "ev-1", variable_values: { tone: "polite" } },
            ],
          },
          output: { response: "hello!" },
          judge_results: [
            { evaluator_uuid: "ev-1", variable_values: { tone: "polite2" } },
          ],
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
        {
          test_case: { name: "Tool call test", evaluation: { type: "tool_call" } },
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
      ],
    };

    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(1);
    expect(result.skippedCount).toBe(1);
    expect(result.items[0].payload.name).toBe("Greeting — run-uuid");
    expect(result.items[0].payload.chat_history).toEqual([
      { role: "user", content: "hi" },
    ]);
    expect(result.items[0].payload.agent_response).toBe("hello!");
    // judge_results is preferred over test_case.evaluators for variable values
    expect(result.items[0].payload.evaluator_variables).toEqual({
      "ev-1": { tone: "polite2" },
    });
    expect(result.evaluatorUuids.has("ev-1")).toBe(true);
  });

  it("falls back to test_case.evaluators variable values when judge_results has none", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "test_run",
      runUuid: "run-uuid-abcdefgh",
      results: [
        {
          test_case: {
            name: "T1",
            evaluation: { type: "response" },
            evaluators: [
              { uuid: "ev-2", variable_values: { foo: "bar" } },
            ],
          },
          output: { response: "resp" },
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
      ],
    };
    const result = buildItemsFromSource(source);
    expect(result.items[0].payload.evaluator_variables).toEqual({
      "ev-2": { foo: "bar" },
    });
    expect(result.evaluatorUuids.has("ev-2")).toBe(true);
  });

  it("builds items from a benchmark_run source across model results", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "benchmark_run",
      benchmarkUuid: "bench-uuid-1234",
      modelResults: [
        {
          model: "gpt-4",
          test_results: [
            {
              test_case: { name: "A", evaluation: { type: "response" } },
              output: { response: "r1" },
            },
          ],
        },
        {
          model: "claude",
          test_results: [
            {
              test_case: { name: "B", evaluation: { type: "response" } },
              output: { response: "r2" },
            },
          ],
        },
      ] as unknown as import("@/components/eval-details").BenchmarkModelResult[],
    };
    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].payload.name).toBe("A — bench-uu — gpt-4");
    expect(result.items[1].payload.name).toBe("B — bench-uu — claude");
  });

  it("falls back to run-level evaluators when no per-test evaluator uuids are present", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "test_run",
      runUuid: "run-uuid-99999999",
      results: [
        {
          test_case: { name: "T", evaluation: { type: "response" } },
          output: { response: "r" },
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
      ],
      evaluators: [{ uuid: "run-level-ev", name: "RunLevel" }],
    };
    const result = buildItemsFromSource(source);
    expect(result.evaluatorUuids.has("run-level-ev")).toBe(true);
  });

  it("returns empty for an unknown source kind", () => {
    // Cast past the type system to exercise the default branch.
    const result = buildItemsFromSource({
      type: "bogus",
    } as unknown as AddRunToLabellingTaskSource);
    expect(result).toEqual({ items: [], skippedCount: 0, evaluatorUuids: new Set() });
  });

  it("builds stt items from an stt_run source", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "stt_run",
      runUuid: "stt-run-abcdefgh",
      rows: [
        {
          name: "Deepgram #1",
          reference_transcript: "hello world",
          predicted_transcript: "hello word",
        },
      ],
      evaluators: [{ uuid: "stt-ev-1", name: "WER judge" }],
    };
    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].payload).toEqual({
      name: "Deepgram #1",
      reference_transcript: "hello world",
      predicted_transcript: "hello word",
    });
    expect(result.evaluatorUuids.has("stt-ev-1")).toBe(true);
  });

  it("builds conversation items from a simulation_run source", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "simulation_run",
      runUuid: "sim-run-abcdefgh",
      results: [
        {
          name: "Frustrated caller — sim-run",
          transcript: [
            { role: "assistant", content: "How can I help?" },
            { role: "user", content: "I need a refund." },
          ],
        },
      ],
      evaluators: [{ uuid: "sim-ev-1", name: "Resolved" }],
    };
    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].payload.name).toBe("Frustrated caller — sim-run");
    expect(result.items[0].payload.transcript).toEqual([
      { role: "assistant", content: "How can I help?" },
      { role: "user", content: "I need a refund." },
    ]);
    expect(result.evaluatorUuids.has("sim-ev-1")).toBe(true);
  });
});

describe("AddRunToLabellingTaskDialog", () => {
  const source: AddRunToLabellingTaskSource = {
    type: "test_run",
    runUuid: "run-uuid-12345678",
    results: [
      {
        test_case: { name: "Greeting", evaluation: { type: "response" } },
        output: { response: "hi" },
        judge_results: [{ evaluator_uuid: "ev-1" }],
      } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useAccessTokenMock.mockReturnValue("token-123");
  });

  it("renders nothing when closed", () => {
    render(
      <AddRunToLabellingTaskDialog
        isOpen={false}
        onClose={jest.fn()}
        source={source}
      />,
    );
    expect(screen.queryByText(/Submit/)).not.toBeInTheDocument();
  });

  it("shows loading then the new-task form when no supported tasks exist", async () => {
    apiClientMock.mockResolvedValue({ items: [] });
    unwrapListMock.mockReturnValue([]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    expect(screen.getByText("Loading tasks")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.queryByText("Loading tasks")).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/No existing tasks were found that include all 1 evaluator/),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Copilot review/)).toBeInTheDocument();
  });

  it("shows an error when loading tasks fails", async () => {
    apiClientMock.mockRejectedValue(new Error("boom"));
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    expect(reportErrorMock).toHaveBeenCalled();
  });

  it("auto-selects the sole supported existing task", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        {
          uuid: "task-1",
          name: "My Task",
          type: "llm",
          evaluators: [{ uuid: "ev-1" }],
        },
      ],
    });
    unwrapListMock.mockReturnValue([
      {
        uuid: "task-1",
        name: "My Task",
        type: "llm",
        evaluators: [{ uuid: "ev-1" }],
      },
    ]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() => {
      expect(screen.getByRole("combobox")).toHaveValue("task-1");
    });
  });

  it("filters out tasks missing required evaluators and explains why", async () => {
    apiClientMock.mockResolvedValue({
      items: [
        { uuid: "task-1", name: "Missing Evaluator Task", type: "llm", evaluators: [] },
      ],
    });
    unwrapListMock.mockReturnValue([
      { uuid: "task-1", name: "Missing Evaluator Task", type: "llm", evaluators: [] },
    ]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/No existing tasks were found that include all 1 evaluator/),
      ).toBeInTheDocument(),
    );
  });

  it("switches between existing and new task modes", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue({
      items: [
        { uuid: "task-1", name: "Task One", type: "llm", evaluators: [{ uuid: "ev-1" }] },
        { uuid: "task-2", name: "Task Two", type: "llm", evaluators: [{ uuid: "ev-1" }] },
      ],
    });
    unwrapListMock.mockReturnValue([
      { uuid: "task-1", name: "Task One", type: "llm", evaluators: [{ uuid: "ev-1" }] },
      { uuid: "task-2", name: "Task Two", type: "llm", evaluators: [{ uuid: "ev-1" }] },
    ]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Use existing task")).toBeInTheDocument(),
    );
    await user.click(screen.getByText("Create new task"));
    expect(screen.getByPlaceholderText(/e.g. Copilot review/)).toBeInTheDocument();
    await user.click(screen.getByText("Use existing task"));
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("requires a name before creating a new task", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue({ items: [] });
    unwrapListMock.mockReturnValue([]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/e.g. Copilot review/)).toBeInTheDocument(),
    );
    // canSubmit gates on newName.trim(), so the button is disabled — assert
    // that state directly rather than relying on click-through validation.
    expect(screen.getByRole("button", { name: /Create task & add/ })).toBeDisabled();
  });

  it("creates a new task, posts items, and reports success", async () => {
    const user = setupUser();
    const onAdded = jest.fn();
    apiClientMock.mockImplementation((path: string, _token: string, opts?: { method?: string; body?: unknown }) => {
      if (path === "/annotation-tasks" && (!opts || !opts.method)) {
        return Promise.resolve({ items: [] });
      }
      if (path === "/annotation-tasks" && opts?.method === "POST") {
        return Promise.resolve({ uuid: "new-task-uuid" });
      }
      if (path === "/annotation-tasks/new-task-uuid/items") {
        return Promise.resolve({});
      }
      return Promise.reject(new Error(`unexpected call ${path}`));
    });
    unwrapListMock.mockReturnValue([]);

    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
        onAdded={onAdded}
      />,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/e.g. Copilot review/)).toBeInTheDocument(),
    );
    await user.type(screen.getByPlaceholderText(/e.g. Copilot review/), "New Task");
    await user.type(
      screen.getByPlaceholderText("Short description of the labelling task"),
      "Some description",
    );
    await user.click(screen.getByRole("button", { name: /Create task & add/ }));

    await waitFor(() =>
      expect(screen.getByText(/Added 1 test/)).toBeInTheDocument(),
    );
    expect(onAdded).toHaveBeenCalledWith("new-task-uuid", 1);
    expect(screen.getByRole("link", { name: "View task" })).toHaveAttribute(
      "href",
      "/human-alignment/tasks/new-task-uuid",
    );

    const postCall = apiClientMock.mock.calls.find(
      (c) => c[0] === "/annotation-tasks" && c[2]?.method === "POST",
    );
    expect(postCall[2].body).toMatchObject({
      name: "New Task",
      description: "Some description",
      type: "llm",
      evaluator_ids: ["ev-1"],
    });
  });

  // NOTE: the `toAttach` evaluator-attachment branch inside handleSubmit's
  // "existing" mode (lines ~442-465 of the source) is unreachable through the
  // UI: `supportedTasks` (the second relevance gate) already filters out any
  // existing task that doesn't carry every evaluator in `evaluatorUuids`, so
  // by the time a task can be selected, `toAttach` is always empty. Not
  // covered here for that reason.

  it("retries after an ITEM_NAME_CONFLICT, skipping conflicting items", async () => {
    const user = setupUser();
    const tasks = [
      { uuid: "task-1", name: "Task One", type: "llm", evaluators: [{ uuid: "ev-1" }] },
    ];
    let itemsCallCount = 0;
    apiClientMock.mockImplementation((path: string, _token: string, opts?: { method?: string }) => {
      if (path === "/annotation-tasks" && !opts) return Promise.resolve({ items: tasks });
      if (path === "/annotation-tasks/task-1/items") {
        itemsCallCount += 1;
        if (itemsCallCount === 1) {
          return Promise.reject(
            new Error(
              'Request failed: 409 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Greeting — run-uuid"]}}',
            ),
          );
        }
        return Promise.resolve({});
      }
      return Promise.reject(new Error("unexpected"));
    });
    unwrapListMock.mockReturnValue(tasks);

    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add to task" }));
    await waitFor(() =>
      expect(
        screen.getByText("This test is already in the task"),
      ).toBeInTheDocument(),
    );
    expect(itemsCallCount).toBe(1);
  });

  it("surfaces a generic failure when adding items fails outright", async () => {
    const user = setupUser();
    const tasks = [
      { uuid: "task-1", name: "Task One", type: "llm", evaluators: [{ uuid: "ev-1" }] },
    ];
    apiClientMock.mockImplementation((path: string, _token: string, opts?: { method?: string }) => {
      if (path === "/annotation-tasks" && !opts) return Promise.resolve({ items: tasks });
      if (path === "/annotation-tasks/task-1/items")
        return Promise.reject(new Error("network down"));
      return Promise.reject(new Error("unexpected"));
    });
    unwrapListMock.mockReturnValue(tasks);

    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Add to task" }));
    await waitFor(() =>
      expect(screen.getByText("network down")).toBeInTheDocument(),
    );
  });

  it("closes via the header close button and Cancel", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue({ items: [] });
    unwrapListMock.mockReturnValue([]);
    const onClose = jest.fn();
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={onClose}
        source={source}
      />,
    );
    await waitFor(() =>
      expect(screen.getByPlaceholderText(/e.g. Copilot review/)).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
    await user.click(screen.getByText("Cancel"));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("shows the skipped-tests banner when tool-call tests were skipped", async () => {
    const sourceWithSkip: AddRunToLabellingTaskSource = {
      type: "test_run",
      runUuid: "run-uuid-12345678",
      results: [
        {
          test_case: { name: "Tool", evaluation: { type: "tool_call" } },
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
      ],
    };
    apiClientMock.mockResolvedValue({ items: [] });
    unwrapListMock.mockReturnValue([]);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={sourceWithSkip}
      />,
    );
    expect(
      screen.getByText("Tool call tests are not added to labelling tasks"),
    ).toBeInTheDocument();
  });

  it("does nothing when there is no access token", async () => {
    useAccessTokenMock.mockReturnValue(null);
    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={source}
      />,
    );
    expect(apiClientMock).not.toHaveBeenCalled();
  });
});
