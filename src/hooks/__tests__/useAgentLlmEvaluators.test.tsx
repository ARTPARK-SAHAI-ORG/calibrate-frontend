import { renderHook, waitFor } from "@/test-utils";
import { useAgentLlmEvaluators } from "../useAgentLlmEvaluators";
import { fetchAgentEvaluators, fetchAllEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/evaluatorApi", () => ({
  __esModule: true,
  fetchAllEvaluators: jest.fn(),
  fetchAgentEvaluators: jest.fn(),
  hasEvaluatorVariables: (e: {
    live_version?: { variables?: unknown[] | null } | null;
  }) => (e.live_version?.variables?.length ?? 0) > 0,
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockFetchEvals = fetchAllEvaluators as jest.Mock;
const mockFetchAgentEvals = fetchAgentEvaluators as jest.Mock;
const mockReportError = reportError as jest.Mock;

const EVALUATORS = [
  {
    uuid: "ev-default",
    name: "Correctness",
    evaluator_type: "llm",
    is_default: true,
    source_default_slug: "default-llm-next-reply",
  },
  { uuid: "ev-custom", name: "My Judge", evaluator_type: "llm" },
  { uuid: "ev-conv", name: "Conversation", evaluator_type: "conversation" },
  {
    uuid: "ev-general-default",
    name: "Correctness",
    evaluator_type: "llm-general",
    is_default: true,
    source_default_slug: "default-llm-general",
  },
  { uuid: "ev-general", name: "Tone", evaluator_type: "llm-general" },
  {
    uuid: "ev-vars",
    name: "Needs Variables",
    evaluator_type: "llm",
    live_version: { variables: [{ name: "topic" }] },
  },
];

function setup(args: Partial<Parameters<typeof useAgentLlmEvaluators>[0]> = {}) {
  return renderHook(() =>
    useAgentLlmEvaluators({
      agentUuid: "ag-1",
      accessToken: "tok",
      ...args,
    }),
  );
}

beforeEach(() => {
  mockFetchEvals.mockReset();
  mockFetchEvals.mockResolvedValue(EVALUATORS);
  mockFetchAgentEvals.mockReset();
  mockFetchAgentEvals.mockResolvedValue([]);
  mockReportError.mockReset();
});

it("offers only reply evaluators that need no variables", async () => {
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.evaluators.map((e) => e.uuid)).toEqual([
    "ev-default",
    "ev-custom",
  ]);
  expect(mockFetchEvals).toHaveBeenCalledWith("tok");
  expect(mockFetchAgentEvals).toHaveBeenCalledWith("ag-1", "tok");
});

it("starts from the agent's own evaluators, skipping ones needing variables", async () => {
  mockFetchAgentEvals.mockResolvedValue([
    { uuid: "ev-custom" },
    { uuid: "ev-vars" },
  ]);
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.preselectedUuids)).toEqual(["ev-custom"]),
  );
});

it("falls back to the built-in reply evaluator when the agent has none", async () => {
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.preselectedUuids)).toEqual(["ev-default"]),
  );
});

it("falls back the same way when the agent's evaluators fail to load", async () => {
  mockFetchAgentEvals.mockRejectedValue(new Error("nope"));
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.preselectedUuids)).toEqual(["ev-default"]),
  );
  expect(result.current.error).toBeNull();
});

it("preselects nothing when neither the agent nor the library has a default", async () => {
  mockFetchEvals.mockResolvedValue([
    { uuid: "ev-custom", name: "My Judge", evaluator_type: "llm" },
  ]);
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(Array.from(result.current.preselectedUuids)).toEqual([]);
});

it("reports a failure to load the library", async () => {
  mockFetchEvals.mockRejectedValue(new Error("boom"));
  const { result } = setup();

  await waitFor(() =>
    expect(result.current.error).toBe("Failed to load evaluators."),
  );
  expect(mockReportError).toHaveBeenCalledWith(
    "Error loading evaluators:",
    expect.any(Error),
  );
});

it("fetches nothing when disabled or signed out", async () => {
  setup({ enabled: false });
  setup({ accessToken: null });

  expect(mockFetchEvals).not.toHaveBeenCalled();
  expect(mockFetchAgentEvals).not.toHaveBeenCalled();
});

it("reads as still loading while there is no sign-in yet, then loads when it lands", async () => {
  const { result, rerender } = renderHook(
    ({ accessToken }: { accessToken: string | null }) =>
      useAgentLlmEvaluators({ agentUuid: "ag-1", accessToken }),
    { initialProps: { accessToken: null as string | null } },
  );

  // Not "loaded, and empty": nothing has been asked for yet.
  expect(result.current.isLoading).toBe(true);
  expect(result.current.error).toBeNull();
  expect(mockFetchEvals).not.toHaveBeenCalled();

  rerender({ accessToken: "tok" });

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(mockFetchEvals).toHaveBeenCalledTimes(1);
  expect(result.current.evaluators.map((e) => e.uuid)).toEqual([
    "ev-default",
    "ev-custom",
  ]);
});

it("offers the output evaluators for a general agent", async () => {
  const { result } = setup({ agentNature: "general" });

  await waitFor(() => expect(result.current.isLoading).toBe(false));

  expect(result.current.evaluators.map((e) => e.uuid)).toEqual([
    "ev-general-default",
    "ev-general",
  ]);
});

it("ticks the built-in output evaluator when a general agent has none", async () => {
  const { result } = setup({ agentNature: "general" });

  await waitFor(() => expect(result.current.isLoading).toBe(false));

  expect(Array.from(result.current.preselectedUuids)).toEqual([
    "ev-general-default",
  ]);
});
