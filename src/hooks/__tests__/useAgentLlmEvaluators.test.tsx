import { useLayoutEffect } from "react";
import { act, renderHook, waitFor } from "@/test-utils";
import { useAgentLlmEvaluators } from "../useAgentLlmEvaluators";
import { fetchAgentEvaluators, fetchAllEvaluators } from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { isMissingTraceValue } from "@/lib/traceScoring";

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

const needsSetup = (evaluators: Parameters<typeof isMissingTraceValue>[0][]) =>
  evaluators.filter(isMissingTraceValue).map((e) => e.uuid);

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

it("offers every reply evaluator, those with variables too", async () => {
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(result.current.evaluators.map((e) => e.uuid)).toEqual([
    "ev-default",
    "ev-custom",
    "ev-vars",
  ]);
  expect(mockFetchEvals).toHaveBeenCalledWith("tok");
  expect(mockFetchAgentEvals).toHaveBeenCalledWith("ag-1", "tok");
});

it("starts from the agent's own evaluators, skipping ones still to set up", async () => {
  mockFetchAgentEvals.mockResolvedValue([
    { uuid: "ev-custom" },
    { uuid: "ev-vars" },
  ]);
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.selectedUuids)).toEqual(["ev-custom"]),
  );
  expect(needsSetup(result.current.evaluators)).toEqual(["ev-vars"]);
  expect(Array.from(result.current.linkedUuids)).toEqual([
    "ev-custom",
    "ev-vars",
  ]);
});

it("carries the trace values saved on the agent and ticks one that has them", async () => {
  mockFetchAgentEvals.mockResolvedValue([
    { uuid: "ev-vars", trace_variables: { topic: "metadata.topic" } },
  ]);
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(
    result.current.evaluators.find((e) => e.uuid === "ev-vars")
      ?.trace_variables,
  ).toEqual({ topic: "metadata.topic" });
  expect(needsSetup(result.current.evaluators)).toEqual([]);
  expect(Array.from(result.current.selectedUuids)).toEqual(["ev-vars"]);
});

it("toggles, and records and ticks values just saved", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(Array.from(result.current.selectedUuids)).toEqual(["ev-default"]);

  act(() => result.current.toggle("ev-default"));
  expect(result.current.selectedUuids.size).toBe(0);
  act(() => result.current.toggle("ev-custom"));
  expect(Array.from(result.current.selectedUuids)).toEqual(["ev-custom"]);

  act(() => result.current.updateTraceVariables("ev-vars", { topic: "input" }));
  expect(needsSetup(result.current.evaluators).includes("ev-vars")).toBe(false);
  expect(result.current.linkedUuids.has("ev-vars")).toBe(true);
  expect(Array.from(result.current.selectedUuids)).toEqual([
    "ev-custom",
    "ev-vars",
  ]);

  // A new one joins what is ticked.
  act(() =>
    result.current.addEvaluator({ uuid: "ev-new", name: "New" } as never),
  );
  expect(result.current.selectedUuids.has("ev-new")).toBe(true);
});

it("lists but does not tick a new evaluator whose variables need setting up", async () => {
  const { result } = setup();
  await waitFor(() => expect(result.current.isLoading).toBe(false));

  act(() =>
    result.current.addEvaluator({
      uuid: "ev-made",
      name: "Made",
      live_version: { variables: [{ name: "topic" }] },
    } as never),
  );

  expect(result.current.evaluators.some((e) => e.uuid === "ev-made")).toBe(
    true,
  );
  expect(needsSetup(result.current.evaluators).includes("ev-made")).toBe(true);
  expect(result.current.selectedUuids.has("ev-made")).toBe(false);
});

it("falls back to the built-in reply evaluator when the agent has none", async () => {
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.selectedUuids)).toEqual(["ev-default"]),
  );
});

it("does not tick the built-in evaluator while its variables need setting up", async () => {
  mockFetchEvals.mockResolvedValue([
    {
      ...EVALUATORS[0],
      live_version: { variables: [{ name: "criteria" }] },
    },
  ]);
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(needsSetup(result.current.evaluators).includes("ev-default")).toBe(true);
  expect(result.current.selectedUuids.size).toBe(0);
});

it("falls back the same way when the agent's evaluators fail to load", async () => {
  mockFetchAgentEvals.mockRejectedValue(new Error("nope"));
  const { result } = setup();

  await waitFor(() =>
    expect(Array.from(result.current.selectedUuids)).toEqual(["ev-default"]),
  );
  expect(result.current.error).toBeNull();
});

it("preselects nothing when neither the agent nor the library has a default", async () => {
  mockFetchEvals.mockResolvedValue([
    { uuid: "ev-custom", name: "My Judge", evaluator_type: "llm" },
  ]);
  const { result } = setup();

  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(Array.from(result.current.selectedUuids)).toEqual([]);
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
    "ev-vars",
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

  expect(Array.from(result.current.selectedUuids)).toEqual([
    "ev-general-default",
  ]);
});

it("shows loading, not the last visit's ticks, on the first frame after reopening", async () => {
  const frames: { loading: boolean; selected: string[] }[] = [];
  const { result, rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) => {
      const r = useAgentLlmEvaluators({
        agentUuid: "ag-1",
        accessToken: "tok",
        enabled,
      });
      // What reached the screen, not renders React threw away.
      useLayoutEffect(() => {
        frames.push({
          loading: r.isLoading,
          selected: Array.from(r.selectedUuids),
        });
      });
      return r;
    },
    { initialProps: { enabled: true } },
  );
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  act(() => result.current.toggle("ev-custom"));
  expect(Array.from(result.current.selectedUuids)).toEqual([
    "ev-default",
    "ev-custom",
  ]);

  rerender({ enabled: false });
  frames.length = 0;
  rerender({ enabled: true });

  expect(frames[0]).toEqual({ loading: true, selected: [] });
  await waitFor(() => expect(result.current.isLoading).toBe(false));
  expect(Array.from(result.current.selectedUuids)).toEqual(["ev-default"]);
});
