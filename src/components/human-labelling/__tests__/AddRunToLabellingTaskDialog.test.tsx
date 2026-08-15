import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  AddRunToLabellingTaskDialog,
  buildItemsFromSource,
  isLabellingEligibleRaw,
  itemNounForSource,
  targetTaskTypeForSource,
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
            history: [{ role: "user", content: "hi" }],
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

  it("appends the agent's output tool call to chat_history as the final turn", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "test_run",
      runUuid: "run-uuid-toolcall1",
      results: [
        {
          test_case: {
            name: "Fills the form",
            evaluation: { type: "response" },
            history: [{ role: "user", content: "sdsd" }],
          },
          output: {
            response: "",
            tool_calls: [
              {
                tool: "process_user_turn",
                arguments: { acknowledgement: "ठीक है" },
                output: { ok: true },
              },
            ],
          },
        } as unknown as import("@/components/TestRunnerDialog").TestCaseResult,
      ],
    };
    const result = buildItemsFromSource(source);
    const history = result.items[0].payload.chat_history as Array<
      Record<string, unknown>
    >;
    // prior user turn + assistant tool-call turn + tool result turn
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({ role: "user", content: "sdsd" });
    expect(history[1]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          type: "function",
          function: {
            name: "process_user_turn",
            arguments: JSON.stringify({ acknowledgement: "ठीक है" }),
          },
        },
      ],
    });
    expect(history[2]).toMatchObject({
      role: "tool",
      content: JSON.stringify({ ok: true }),
    });
    // the tool result turn is keyed back to the assistant call's id
    expect((history[1].tool_calls as Array<{ id: string }>)[0].id).toBe(
      history[2].tool_call_id,
    );
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
              test_case: {
                name: "B",
                evaluation: { type: "response" },
                history: [{ role: "user", content: "go" }],
              },
              output: {
                response: "",
                tool_calls: [
                  { tool: "process_user_turn", arguments: { ack: "ok" } },
                ],
              },
            },
          ],
        },
      ] as unknown as import("@/components/eval-details").BenchmarkModelResult[],
    };
    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].payload.name).toBe("A — bench-uu — gpt-4");
    expect(result.items[1].payload.name).toBe("B — bench-uu — claude");
    // The tool-call output on the benchmark path lands in chat_history too.
    const history = result.items[1].payload.chat_history as Array<
      Record<string, unknown>
    >;
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual({ role: "user", content: "go" });
    expect(history[1]).toMatchObject({
      role: "assistant",
      tool_calls: [{ function: { name: "process_user_turn" } }],
    });
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

  it("builds tts items from a tts_run source", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "tts_run",
      runUuid: "tts-run-abcdefgh",
      rows: [
        {
          name: "ElevenLabs #1",
          text: "hello world",
          audio_path: "https://example.com/a.wav",
        },
      ],
      evaluators: [{ uuid: "tts-ev-1", name: "Naturalness" }],
    };
    const result = buildItemsFromSource(source);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].payload).toEqual({
      name: "ElevenLabs #1",
      text: "hello world",
      audio_path: "https://example.com/a.wav",
    });
    expect(result.evaluatorUuids.has("tts-ev-1")).toBe(true);
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

  it("builds one llm item per trace and targets an llm task", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "traces",
      agentUuid: "agent-uuid-1",
      traces: [
        {
          name: "Refund question",
          input: [{ role: "user", content: "where is my refund?" }],
          output: { response: "Let me check that." },
        },
        {
          name: "Greeting",
          input: [{ role: "user", content: "hi" }],
          output: { response: "hello!" },
        },
      ],
      evaluators: [{ uuid: "trace-ev-1", name: "Helpfulness" }],
    };
    const result = buildItemsFromSource(source);
    // Fails if the mapping drops `evaluation: { type: "response" }` — every
    // trace would be counted as skipped instead of built.
    expect(result.items).toHaveLength(2);
    expect(result.skippedCount).toBe(0);
    expect(result.items[0].payload.name).toBe("Refund question");
    expect(result.items[0].payload.chat_history).toEqual([
      { role: "user", content: "where is my refund?" },
    ]);
    expect(result.items[0].payload.agent_response).toBe("Let me check that.");
    expect(result.items[0].payload.evaluator_variables).toEqual({});
    expect(result.items[1].payload.name).toBe("Greeting");
    expect(Array.from(result.evaluatorUuids)).toEqual(["trace-ev-1"]);
    expect(targetTaskTypeForSource(source)).toBe("llm");
    expect(itemNounForSource(source)).toEqual({ one: "trace", many: "traces" });
  });

  it("appends a trace's output tool calls to chat_history as the final turns", () => {
    const source: AddRunToLabellingTaskSource = {
      type: "traces",
      agentUuid: "agent-uuid-1",
      traces: [
        {
          name: "Books an appointment",
          input: [{ role: "user", content: "book me in" }],
          output: {
            response: "",
            tool_calls: [
              {
                tool: "book_appointment",
                arguments: { day: "Monday" },
                output: { ok: true },
              },
            ],
          },
        },
      ],
    };
    const result = buildItemsFromSource(source);
    const history = result.items[0].payload.chat_history as Array<
      Record<string, unknown>
    >;
    expect(history).toHaveLength(3);
    expect(history[0]).toEqual({ role: "user", content: "book me in" });
    expect(history[1]).toMatchObject({
      role: "assistant",
      tool_calls: [
        {
          type: "function",
          function: {
            name: "book_appointment",
            arguments: JSON.stringify({ day: "Monday" }),
          },
        },
      ],
    });
    expect(history[2]).toMatchObject({
      role: "tool",
      content: JSON.stringify({ ok: true }),
    });
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
      screen.getByText(/No existing tasks were found that include the evaluator in the selected tests/),
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
        screen.getByText(/No existing tasks were found that include the evaluator in the selected tests/),
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

  it("creates a tts task and posts text/audio_path item payloads", async () => {
    const user = setupUser();
    const ttsSource: AddRunToLabellingTaskSource = {
      type: "tts_run",
      runUuid: "tts-run-abcdefgh",
      runName: "greetings dataset",
      rows: [
        {
          name: "ElevenLabs #1 — tts-run-",
          text: "hello world",
          audio_path: "https://example.com/a.wav",
        },
      ],
      evaluators: [{ uuid: "tts-ev-1", name: "Naturalness" }],
    };
    const postedItemsBodies: unknown[] = [];
    apiClientMock.mockImplementation(
      (
        path: string,
        _token: string,
        opts?: { method?: string; body?: unknown },
      ) => {
        if (path === "/annotation-tasks" && (!opts || !opts.method)) {
          return Promise.resolve({ items: [] });
        }
        if (path === "/annotation-tasks" && opts?.method === "POST") {
          return Promise.resolve({ uuid: "tts-task-uuid" });
        }
        if (path === "/annotation-tasks/tts-task-uuid/items") {
          postedItemsBodies.push(opts?.body);
          return Promise.resolve({});
        }
        return Promise.reject(new Error(`unexpected call ${path}`));
      },
    );
    unwrapListMock.mockReturnValue([]);

    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={ttsSource}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/e.g. Copilot review/),
      ).toBeInTheDocument(),
    );
    // Header uses the "result(s)" noun for tts sources.
    expect(
      screen.getByText(/Submit 1 result for labelling/),
    ).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText(/e.g. Copilot review/),
      "TTS batch",
    );
    await user.click(screen.getByRole("button", { name: /Create task & add/ }));

    await waitFor(() =>
      expect(screen.getByText(/Added 1 result/)).toBeInTheDocument(),
    );

    const postCall = apiClientMock.mock.calls.find(
      (c) => c[0] === "/annotation-tasks" && c[2]?.method === "POST",
    );
    expect(postCall[2].body).toMatchObject({
      name: "TTS batch",
      type: "tts",
      evaluator_ids: ["tts-ev-1"],
    });
    expect(postedItemsBodies).toEqual([
      {
        items: [
          {
            payload: {
              name: "ElevenLabs #1 — tts-run-",
              text: "hello world",
              audio_path: "https://example.com/a.wav",
            },
          },
        ],
      },
    ]);
  });

  it("creates an llm task from traces using the evaluators the caller passed", async () => {
    const user = setupUser();
    const tracesSource: AddRunToLabellingTaskSource = {
      type: "traces",
      agentUuid: "agent-uuid-1",
      traces: [
        {
          name: "Refund question",
          input: [{ role: "user", content: "where is my refund?" }],
          output: { response: "Let me check that." },
        },
      ],
      evaluators: [
        { uuid: "trace-ev-1", name: "Helpfulness" },
        { uuid: "trace-ev-2", name: "Tone" },
      ],
    };
    const postedItemsBodies: unknown[] = [];
    apiClientMock.mockImplementation(
      (
        path: string,
        _token: string,
        opts?: { method?: string; body?: unknown },
      ) => {
        if (path === "/annotation-tasks" && (!opts || !opts.method)) {
          return Promise.resolve({ items: [] });
        }
        if (path === "/annotation-tasks" && opts?.method === "POST") {
          return Promise.resolve({ uuid: "traces-task-uuid" });
        }
        if (path === "/annotation-tasks/traces-task-uuid/items") {
          postedItemsBodies.push(opts?.body);
          return Promise.resolve({});
        }
        return Promise.reject(new Error(`unexpected call ${path}`));
      },
    );
    unwrapListMock.mockReturnValue([]);

    render(
      <AddRunToLabellingTaskDialog
        isOpen
        onClose={jest.fn()}
        source={tracesSource}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText(/e.g. Copilot review/),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText(/Submit 1 trace for labelling/)).toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText(/e.g. Copilot review/),
      "Trace batch",
    );
    await user.click(screen.getByRole("button", { name: /Create task & add/ }));

    await waitFor(() =>
      expect(screen.getByText(/Added 1 trace/)).toBeInTheDocument(),
    );
    // The heading switches to the finished wording, and the body no longer
    // repeats the "View task" button in a sentence.
    expect(screen.getByText("Submitted for labelling")).toBeInTheDocument();
    expect(screen.queryByText(/Submit 1 trace for labelling/)).toBeNull();
    expect(screen.queryByText(/start labelling/)).toBeNull();

    const postCall = apiClientMock.mock.calls.find(
      (c) => c[0] === "/annotation-tasks" && c[2]?.method === "POST",
    );
    expect(postCall[2].body).toMatchObject({
      name: "Trace batch",
      type: "llm",
      evaluator_ids: ["trace-ev-1", "trace-ev-2"],
    });
    expect(postedItemsBodies).toEqual([
      {
        items: [
          {
            payload: {
              name: "Refund question",
              chat_history: [{ role: "user", content: "where is my refund?" }],
              agent_response: "Let me check that.",
              evaluator_variables: {},
            },
          },
        ],
      },
    ]);
  });

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
    expect(
      apiClientMock.mock.calls.some((c) =>
        String(c[0]).includes("/evaluators"),
      ),
    ).toBe(false);
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
