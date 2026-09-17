import { act, renderHook, waitFor } from "@testing-library/react";
import { useAgentTraceScoring } from "../useAgentTraceScoring";
import {
  fetchTraceScoringEligibility,
  setAgentAutoScoreTraces,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

jest.mock("../../lib/tracesApi", () => ({
  __esModule: true,
  fetchTraceScoringEligibility: jest.fn(),
  setAgentAutoScoreTraces: jest.fn(),
}));
jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const mockEligibility = fetchTraceScoringEligibility as jest.Mock;
const mockSetFlag = setAgentAutoScoreTraces as jest.Mock;
const mockReportError = reportError as jest.Mock;

const eligible = {
  eligible: [
    {
      evaluator_uuid: "ev-1",
      evaluator_version_id: "ver-1",
      name: "Tone",
    },
  ],
  ineligible: [],
};

const blocked = {
  eligible: [],
  ineligible: [
    {
      evaluator_uuid: "ev-2",
      name: "Correctness",
      reason: "declares_variables" as const,
    },
  ],
};

function setup(enabled = false, isActive = true) {
  return renderHook(
    (props: { enabled: boolean; isActive: boolean }) =>
      useAgentTraceScoring({
        accessToken: "tok",
        agentUuid: "ag-1",
        enabled: props.enabled,
        isActive: props.isActive,
      }),
    { initialProps: { enabled, isActive } },
  );
}

beforeEach(() => {
  mockEligibility.mockReset();
  mockSetFlag.mockReset();
  mockReportError.mockReset();
  mockEligibility.mockResolvedValue(eligible);
  mockSetFlag.mockResolvedValue({ auto_score_traces: true });
});

it("loads eligibility and allows enabling when at least one evaluator can score", async () => {
  const { result } = setup(false);
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());
  expect(result.current.enableBlocked).toBe(false);

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(mockSetFlag).toHaveBeenCalledWith("tok", "ag-1", true);
  expect(result.current.enabled).toBe(true);
});

it("hard-blocks enabling when no evaluator is eligible", async () => {
  mockEligibility.mockResolvedValue(blocked);
  const { result } = setup(false);
  await waitFor(() => expect(result.current.enableBlocked).toBe(true));

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(mockSetFlag).not.toHaveBeenCalled();
  expect(result.current.enabled).toBe(false);
});

it("still allows turning scoring off after eligibility drifts", async () => {
  mockEligibility.mockResolvedValue(blocked);
  mockSetFlag.mockResolvedValue({ auto_score_traces: false });
  const { result } = setup(true);
  await waitFor(() => expect(result.current.enabled).toBe(true));
  expect(result.current.enableBlocked).toBe(false);

  await act(async () => {
    await result.current.setEnabled(false);
  });
  expect(mockSetFlag).toHaveBeenCalledWith("tok", "ag-1", false);
  expect(result.current.enabled).toBe(false);
});

it("surfaces a generic error when enabling fails for another reason", async () => {
  mockSetFlag.mockRejectedValue(
    new Error("Request failed: 500 - {\"detail\":\"boom\"}"),
  );
  const { result } = setup(false);
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(result.current.saveError).toBe(
    "Something went wrong on our end. Please try again in a moment.",
  );
  expect(mockReportError).toHaveBeenCalled();
});

it("drops the refusal message when the reader comes back to the tab", async () => {
  mockSetFlag.mockRejectedValue(
    new Error(
      `Request failed: 422 - ${JSON.stringify({
        detail: "There are no eligible evaluators configured for this agent",
      })}`,
    ),
  );
  const { result, rerender } = renderHook(
    (props: { isActive: boolean }) =>
      useAgentTraceScoring({
        accessToken: "tok",
        agentUuid: "ag-1",
        enabled: false,
        isActive: props.isActive,
      }),
    { initialProps: { isActive: true } },
  );
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());
  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(result.current.saveError).toMatch(/no eligible evaluators/);

  rerender({ isActive: false });
  rerender({ isActive: true });
  await waitFor(() => expect(result.current.saveError).toBeNull());
});

it("records when eligibility cannot be loaded", async () => {
  mockEligibility.mockRejectedValue(new Error("offline"));
  const { result } = setup(false);
  await waitFor(() =>
    expect(result.current.eligibilityError).toMatch(/Could not check/),
  );
  expect(result.current.enableBlocked).toBe(false);
  expect(mockReportError).toHaveBeenCalled();
});

it("shows the backend message and rechecks eligibility when enabling is refused", async () => {
  mockSetFlag.mockRejectedValue(
    new Error(
      `Request failed: 422 - ${JSON.stringify({
        detail: "There are no eligible evaluators configured for this agent",
      })}`,
    ),
  );
  const { result } = setup(false);
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());
  mockEligibility.mockResolvedValue(blocked);

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(result.current.saveError).toMatch(/no eligible evaluators/);
  await waitFor(() => expect(result.current.enableBlocked).toBe(true));
  expect(mockEligibility).toHaveBeenCalledTimes(2);
  expect(mockReportError).toHaveBeenCalled();
});

it("does not PUT when scoring is already in the requested state", async () => {
  const { result } = setup(true);
  await waitFor(() => expect(result.current.enabled).toBe(true));
  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(mockSetFlag).not.toHaveBeenCalled();
});

it("notifies the parent after a successful toggle", async () => {
  const onEnabledChange = jest.fn();
  const { result } = renderHook(() =>
    useAgentTraceScoring({
      accessToken: "tok",
      agentUuid: "ag-1",
      enabled: false,
      onEnabledChange,
    }),
  );
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());
  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(onEnabledChange).toHaveBeenCalledWith(true);
});

it("does nothing without an access token", async () => {
  const { result } = renderHook(() =>
    useAgentTraceScoring({
      accessToken: null,
      agentUuid: "ag-1",
      enabled: false,
    }),
  );
  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(mockEligibility).not.toHaveBeenCalled();
  expect(mockSetFlag).not.toHaveBeenCalled();
});

it("does not treat a missing eligibility payload as blocked while the first check is in flight", async () => {
  let resolveEligibility: (value: unknown) => void = () => {};
  mockEligibility.mockReturnValue(
    new Promise((resolve) => {
      resolveEligibility = resolve;
    }),
  );
  const { result } = setup(false);
  expect(result.current.eligibility).toBeNull();
  expect(result.current.enableBlocked).toBe(false);

  await act(async () => {
    resolveEligibility(blocked);
  });
  await waitFor(() => expect(result.current.enableBlocked).toBe(true));
});

it("does not fetch until the traces tab is on screen, then refetches when it returns", async () => {
  const { rerender } = renderHook(
    (props: { isActive: boolean }) =>
      useAgentTraceScoring({
        accessToken: "tok",
        agentUuid: "ag-1",
        enabled: false,
        isActive: props.isActive,
      }),
    { initialProps: { isActive: false } },
  );
  expect(mockEligibility).not.toHaveBeenCalled();

  rerender({ isActive: true });
  await waitFor(() => expect(mockEligibility).toHaveBeenCalledTimes(1));

  mockEligibility.mockResolvedValue(blocked);
  rerender({ isActive: false });
  rerender({ isActive: true });
  await waitFor(() => expect(mockEligibility).toHaveBeenCalledTimes(2));
});

it("ignores a slower eligibility response after the agent changes", async () => {
  let resolveFirst: (value: unknown) => void = () => {};
  mockEligibility.mockImplementation((_token: string, uuid: string) => {
    if (uuid === "ag-a") {
      return new Promise((resolve) => {
        resolveFirst = resolve;
      });
    }
    return Promise.resolve(eligible);
  });

  const { result, rerender } = renderHook(
    (props: { agentUuid: string }) =>
      useAgentTraceScoring({
        accessToken: "tok",
        agentUuid: props.agentUuid,
        enabled: false,
      }),
    { initialProps: { agentUuid: "ag-a" } },
  );

  rerender({ agentUuid: "ag-b" });
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());

  await act(async () => {
    resolveFirst(blocked);
  });
  expect(result.current.enableBlocked).toBe(false);
  expect(result.current.eligibility?.eligible[0].name).toBe("Tone");
});

it("ignores a slower eligibility failure after the agent changes", async () => {
  let rejectFirst: (error: unknown) => void = () => {};
  mockEligibility.mockImplementation((_token: string, uuid: string) => {
    if (uuid === "ag-a") {
      return new Promise((_, reject) => {
        rejectFirst = reject;
      });
    }
    return Promise.resolve(eligible);
  });

  const { result, rerender } = renderHook(
    (props: { agentUuid: string }) =>
      useAgentTraceScoring({
        accessToken: "tok",
        agentUuid: props.agentUuid,
        enabled: false,
      }),
    { initialProps: { agentUuid: "ag-a" } },
  );

  rerender({ agentUuid: "ag-b" });
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());

  await act(async () => {
    rejectFirst(new Error("offline"));
  });
  expect(result.current.eligibility?.eligible[0].name).toBe("Tone");
  expect(result.current.eligibilityError).toBeNull();
});

it("keeps eligibility as checked when a validation 422 refuses the save", async () => {
  mockSetFlag.mockRejectedValue(
    new Error(
      `Request failed: 422 - ${JSON.stringify({
        detail: [
          { loc: ["body", "name"], msg: "Field required", type: "missing" },
        ],
      })}`,
    ),
  );
  const { result } = setup(false);
  await waitFor(() => expect(result.current.eligibility).not.toBeNull());

  await act(async () => {
    await result.current.setEnabled(true);
  });
  expect(result.current.enableBlocked).toBe(false);
  expect(result.current.eligibility?.eligible).toHaveLength(1);
  expect(result.current.saveError).toMatch(/Field required/);
});

