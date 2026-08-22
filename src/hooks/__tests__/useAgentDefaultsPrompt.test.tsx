import { act, renderHook, waitFor } from "@testing-library/react";
import { useAgentDefaultsPrompt } from "../useAgentDefaultsPrompt";

const fetchAgentEvaluators = jest.fn();
const fetchAllEvaluators = jest.fn();
const addEvaluatorsToAgent = jest.fn();
jest.mock("../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: (...args: unknown[]) => fetchAgentEvaluators(...args),
  fetchAllEvaluators: (...args: unknown[]) => fetchAllEvaluators(...args),
  addEvaluatorsToAgent: (...args: unknown[]) => addEvaluatorsToAgent(...args),
}));

const reportError = jest.fn();
jest.mock("../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));

const setup = (over: Partial<Parameters<typeof useAgentDefaultsPrompt>[0]> = {}) =>
  renderHook(() =>
    useAgentDefaultsPrompt({
      agentUuid: "agent-1",
      accessToken: "tok",
      ...over,
    }),
  );

beforeEach(() => {
  jest.clearAllMocks();
  fetchAgentEvaluators.mockResolvedValue([{ uuid: "ev-attached" }]);
  fetchAllEvaluators.mockResolvedValue([
    { uuid: "ev-new", name: "Tone check" },
  ]);
  addEvaluatorsToAgent.mockResolvedValue({});
});

it("asks only about the evaluators the agent does not have", async () => {
  const { result } = setup();

  let shown = false;
  await act(async () => {
    shown = await result.current.promptFor(["ev-attached", "ev-new"]);
  });

  expect(shown).toBe(true);
  expect(result.current.prompt).toEqual([{ uuid: "ev-new", name: "Tone check" }]);
});

it("asks nothing when the agent already has every one of them", async () => {
  const { result } = setup();

  let shown = true;
  await act(async () => {
    shown = await result.current.promptFor(["ev-attached"]);
  });

  expect(shown).toBe(false);
  expect(result.current.prompt).toBeNull();
});

it("uses the name the caller already has instead of reading the library", async () => {
  const { result } = setup();

  await act(async () => {
    await result.current.promptFor(["ev-new"], {
      knownNames: new Map([["ev-new", "Made moments ago"]]),
    });
  });

  expect(fetchAllEvaluators).not.toHaveBeenCalled();
  expect(result.current.prompt).toEqual([
    { uuid: "ev-new", name: "Made moments ago" },
  ]);
});

it("falls back to the caller's list when the agent's evaluators cannot be read", async () => {
  fetchAgentEvaluators.mockRejectedValue(new Error("offline"));
  const { result } = setup();

  await act(async () => {
    await result.current.promptFor(["ev-new"], {
      fallbackAttached: new Set(["ev-attached"]),
    });
  });

  expect(reportError).toHaveBeenCalled();
  expect(result.current.prompt).toEqual([{ uuid: "ev-new", name: "Tone check" }]);
});

it("asks nothing when the agent's evaluators cannot be read and there is no fallback", async () => {
  fetchAgentEvaluators.mockRejectedValue(new Error("offline"));
  const { result } = setup();

  let shown = true;
  await act(async () => {
    shown = await result.current.promptFor(["ev-new"]);
  });

  expect(shown).toBe(false);
  expect(result.current.prompt).toBeNull();
});

it("attaches the evaluators and closes, telling the caller both times", async () => {
  const onAttached = jest.fn();
  const onSettled = jest.fn();
  const { result } = setup({ onAttached, onSettled });

  await act(async () => {
    await result.current.promptFor(["ev-new"]);
  });
  await act(async () => {
    await result.current.confirm();
  });

  expect(addEvaluatorsToAgent).toHaveBeenCalledWith("agent-1", ["ev-new"], "tok");
  expect(onAttached).toHaveBeenCalledTimes(1);
  expect(onSettled).toHaveBeenCalledTimes(1);
  expect(result.current.prompt).toBeNull();
});

it("keeps the prompt up with the failure when attaching fails", async () => {
  addEvaluatorsToAgent.mockRejectedValue(new Error("Server said no"));
  const onSettled = jest.fn();
  const { result } = setup({ onSettled });

  await act(async () => {
    await result.current.promptFor(["ev-new"]);
  });
  await act(async () => {
    await result.current.confirm();
  });

  expect(result.current.error).toBe("Server said no");
  expect(result.current.prompt).toEqual([{ uuid: "ev-new", name: "Tone check" }]);
  expect(onSettled).not.toHaveBeenCalled();
});

it("skipping closes the prompt without attaching anything", async () => {
  const onSettled = jest.fn();
  const { result } = setup({ onSettled });

  await act(async () => {
    await result.current.promptFor(["ev-new"]);
  });
  act(() => {
    result.current.dismiss();
  });

  await waitFor(() => expect(result.current.prompt).toBeNull());
  expect(addEvaluatorsToAgent).not.toHaveBeenCalled();
  expect(onSettled).toHaveBeenCalledTimes(1);
});

it("asks nothing without a signed-in token or with an empty list", async () => {
  const { result } = setup({ accessToken: null });

  let shown = true;
  await act(async () => {
    shown = await result.current.promptFor(["ev-new"]);
  });
  expect(shown).toBe(false);
  expect(fetchAgentEvaluators).not.toHaveBeenCalled();

  const signedIn = setup();
  await act(async () => {
    shown = await signedIn.result.current.promptFor([]);
  });
  expect(shown).toBe(false);
  expect(fetchAgentEvaluators).not.toHaveBeenCalled();
});

it("falls back to a plain label when the library cannot be read", async () => {
  fetchAllEvaluators.mockRejectedValue(new Error("offline"));
  const { result } = setup();

  await act(async () => {
    await result.current.promptFor(["ev-new"]);
  });

  expect(result.current.prompt).toEqual([
    { uuid: "ev-new", name: "Evaluator" },
  ]);
});

it("says which evaluators failed when the failure carries no message", async () => {
  addEvaluatorsToAgent.mockRejectedValue("no message here");
  const { result } = setup();

  await act(async () => {
    await result.current.promptFor(["ev-new"]);
  });
  await act(async () => {
    await result.current.confirm();
  });
  expect(result.current.error).toBe("Failed to attach the evaluator");

  fetchAllEvaluators.mockResolvedValue([
    { uuid: "ev-new", name: "Tone check" },
    { uuid: "ev-two", name: "Another" },
  ]);
  const two = setup();
  await act(async () => {
    await two.result.current.promptFor(["ev-new", "ev-two"]);
  });
  await act(async () => {
    await two.result.current.confirm();
  });
  expect(two.result.current.error).toBe("Failed to attach the evaluators");
});
