import { renderHook, act, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { useStartTestRun } from "../useStartTestRun";
import { startAgentTestRun } from "@/lib/agentTestRun";
import { reportError } from "@/lib/reportError";

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("../../lib/agentTestRun", () => ({
  __esModule: true,
  startAgentTestRun: jest.fn(),
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

jest.mock("../useAccessToken", () => ({
  __esModule: true,
  useAccessToken: () => "token-123",
}));

const startMock = startAgentTestRun as jest.Mock;

const tests = [{ uuid: "t1" }, { uuid: "t2" }];

describe("useStartTestRun", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("starts the run and reports the new uuid", async () => {
    startMock.mockResolvedValue("run-1");
    const onStarted = jest.fn();
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });

    expect(startMock).toHaveBeenCalledWith({
      agentUuid: "agent-1",
      testUuids: ["t1", "t2"],
      runAllLinked: undefined,
      accessToken: "token-123",
    });
    expect(onStarted).toHaveBeenCalledWith("run-1");
  });

  it("passes runAllLinked through", async () => {
    startMock.mockResolvedValue("run-2");
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({
        agentUuid: "agent-1",
        tests,
        runAllLinked: true,
        onStarted: jest.fn(),
      });
    });

    expect(startMock.mock.calls[0][0].runAllLinked).toBe(true);
  });

  it("ignores a repeat call while the first is still in flight", async () => {
    let release: (value: string) => void = () => {};
    startMock.mockImplementation(
      () => new Promise<string>((resolve) => (release = resolve)),
    );
    const onStarted = jest.fn();
    const { result } = renderHook(() => useStartTestRun());

    let first: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current({ agentUuid: "agent-1", tests, onStarted });
    });
    // Second click while the first request is still open.
    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });
    expect(startMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      release("run-3");
      await first;
    });
    expect(onStarted).toHaveBeenCalledTimes(1);
  });

  it("allows a new run once the previous one settled", async () => {
    startMock.mockResolvedValue("run-4");
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({
        agentUuid: "agent-1",
        tests,
        onStarted: jest.fn(),
      });
    });
    await act(async () => {
      await result.current({
        agentUuid: "agent-1",
        tests,
        onStarted: jest.fn(),
      });
    });

    expect(startMock).toHaveBeenCalledTimes(2);
  });

  it("bails quietly when the session expired", async () => {
    startMock.mockResolvedValue(null);
    const onStarted = jest.fn();
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });

    expect(onStarted).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("reports a failure as a toast and does not call onStarted", async () => {
    startMock.mockRejectedValue(new Error("backend exploded"));
    const onStarted = jest.fn();
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });

    expect(onStarted).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith("backend exploded");
    expect(reportError).toHaveBeenCalled();
  });

  it("releases the guard after a failure so the next click works", async () => {
    startMock.mockRejectedValueOnce(new Error("nope"));
    startMock.mockResolvedValueOnce("run-5");
    const onStarted = jest.fn();
    const { result } = renderHook(() => useStartTestRun());

    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });
    await act(async () => {
      await result.current({ agentUuid: "agent-1", tests, onStarted });
    });

    await waitFor(() => expect(onStarted).toHaveBeenCalledWith("run-5"));
  });
});
