import React from "react";
import { act, render, renderHook, screen } from "@/test-utils";
import { useAgentRunLaunchers } from "../useAgentRunLaunchers";
import type { BenchmarkDialog } from "../../BenchmarkDialog";
import { toast } from "sonner";

type BenchmarkProps = React.ComponentProps<typeof BenchmarkDialog>;

const startTestRunOrNotifyMock = jest.fn();
jest.mock("../../../lib/testRunApi", () => ({
  __esModule: true,
  startTestRunOrNotify: (...args: unknown[]) =>
    startTestRunOrNotifyMock(...args),
}));

const overEvalLimitMock = jest.fn();
jest.mock("../../../lib/evalLimit", () => ({
  __esModule: true,
  overEvalLimit: (...args: unknown[]) => overEvalLimitMock(...args),
}));

jest.mock("../../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => "token-1",
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

let verifyProps: { onVerified: () => void } | null = null;
jest.mock("../../VerifyConnectionDialog", () => ({
  __esModule: true,
  VerifyConnectionDialog: (props: { onVerified: () => void }) => {
    verifyProps = props;
    return <div data-testid="verify-dialog" />;
  },
}));

jest.mock("../EnableBenchmarkDialog", () => ({
  __esModule: true,
  EnableBenchmarkDialog: (props: { isOpen: boolean }) =>
    props.isOpen ? <div data-testid="enable-benchmark-dialog" /> : null,
}));

let benchmarkProps: BenchmarkProps | null = null;
jest.mock("../../BenchmarkDialog", () => ({
  __esModule: true,
  BenchmarkDialog: (props: BenchmarkProps) => {
    benchmarkProps = props;
    return <div data-testid="benchmark-dialog" />;
  },
}));

const tests = [
  { uuid: "t1", name: "First" },
  { uuid: "t2", name: "Second" },
];

function setup(extra: Partial<Parameters<typeof useAgentRunLaunchers>[0]> = {}) {
  const onRunCreated = jest.fn();
  const hook = renderHook(() =>
    useAgentRunLaunchers({
      agentUuid: "agent-1",
      agentName: "Agent",
      linkedTestsTotal: 7,
      onRunCreated,
      ...extra,
    }),
  );
  // The dialogs are what the hook returns to mount; draw the latest copy.
  const view = render(<>{hook.result.current.dialogs}</>);
  const redraw = () => view.rerender(<>{hook.result.current.dialogs}</>);
  return { hook, onRunCreated, redraw };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend";
  startTestRunOrNotifyMock.mockReset().mockResolvedValue("task-1");
  overEvalLimitMock.mockReset().mockResolvedValue(false);
  benchmarkProps = null;
  verifyProps = null;
  (toast.error as jest.Mock).mockClear();
});

describe("useAgentRunLaunchers", () => {
  it("creates a run with the test ids and count, then reports it", async () => {
    const { hook, onRunCreated } = setup();
    let taskId: string | null = null;
    await act(async () => {
      taskId = await hook.result.current.launchTestRun(tests, false, "bulk");
    });
    expect(startTestRunOrNotifyMock).toHaveBeenCalledWith(
      "http://backend",
      "token-1",
      "agent-1",
      ["t1", "t2"],
      2,
    );
    expect(onRunCreated).toHaveBeenCalledWith("task-1");
    expect(taskId).toBe("task-1");
  });

  it("sends no ids and the linked total when running every linked test", async () => {
    const { hook } = setup();
    await act(async () => {
      await hook.result.current.launchTestRun([], true);
    });
    expect(startTestRunOrNotifyMock).toHaveBeenCalledWith(
      "http://backend",
      "token-1",
      "agent-1",
      null,
      7,
    );
  });

  it("holds the run behind the connection check on an unverified connection agent", async () => {
    const { hook, onRunCreated, redraw } = setup({
      agentType: "connection",
      connectionVerified: false,
    });
    expect(hook.result.current.isConnectionUnverified).toBe(true);
    await act(async () => {
      await hook.result.current.launchTestRun(tests);
    });
    redraw();
    expect(startTestRunOrNotifyMock).not.toHaveBeenCalled();
    expect(onRunCreated).not.toHaveBeenCalled();
    expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
  });

  it("does not open the model picker when the run is over the limit", async () => {
    overEvalLimitMock.mockResolvedValue(true);
    const { hook, redraw } = setup();
    await act(async () => {
      await hook.result.current.openCompare(tests, false);
    });
    redraw();
    expect(overEvalLimitMock).toHaveBeenCalledWith("token-1", 2, "tests");
    expect(screen.queryByTestId("benchmark-dialog")).toBeNull();
  });

  it("opens the model picker on the given tests when under the limit", async () => {
    const onComparisonCreated = jest.fn();
    const onComparisonClosed = jest.fn();
    const { hook, redraw } = setup({ onComparisonCreated, onComparisonClosed });
    await act(async () => {
      await hook.result.current.openCompare(tests, false);
    });
    redraw();
    expect(screen.getByTestId("benchmark-dialog")).toBeInTheDocument();
    expect(benchmarkProps?.tests).toEqual(tests);
    expect(benchmarkProps?.totalTests).toBe(7);

    act(() => benchmarkProps?.onBenchmarkCreated?.("bench-1"));
    expect(onComparisonCreated).toHaveBeenCalledWith("bench-1");
    act(() => benchmarkProps?.onClose());
    redraw();
    expect(onComparisonClosed).toHaveBeenCalledWith(true);
    expect(screen.queryByTestId("benchmark-dialog")).toBeNull();
  });

  it("checks the linked total and names no tests when comparing every linked test", async () => {
    const { hook, redraw } = setup();
    await act(async () => {
      await hook.result.current.openCompare(tests, true);
    });
    redraw();
    expect(overEvalLimitMock).toHaveBeenCalledWith("token-1", 7, "tests");
    expect(benchmarkProps?.tests).toEqual([]);
  });

  it("asks to turn benchmarking on first when it can be turned on here", async () => {
    const { hook, redraw } = setup({
      agentType: "connection",
      connectionVerified: true,
      supportsBenchmark: false,
      onEnableBenchmark: jest.fn(),
    });
    expect(hook.result.current.canEnableBenchmarkHere).toBe(true);
    await act(async () => {
      await hook.result.current.openCompare([], true);
    });
    redraw();
    expect(screen.getByTestId("enable-benchmark-dialog")).toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-dialog")).toBeNull();
  });

  it("starts the held run with the held tests once the connection check passes", async () => {
    const onConnectionVerified = jest.fn();
    const { hook, onRunCreated, redraw } = setup({
      agentType: "connection",
      connectionVerified: false,
      onConnectionVerified,
    });
    await act(async () => {
      await hook.result.current.launchTestRun(tests, false, "bulk");
    });
    redraw();
    await act(async () => {
      verifyProps?.onVerified();
    });
    redraw();
    expect(onConnectionVerified).toHaveBeenCalledTimes(1);
    expect(startTestRunOrNotifyMock).toHaveBeenCalledWith(
      "http://backend",
      "token-1",
      "agent-1",
      ["t1", "t2"],
      2,
    );
    expect(onRunCreated).toHaveBeenCalledWith("task-1");
    expect(screen.queryByTestId("verify-dialog")).toBeNull();
  });

  describe("confirmTestRun", () => {
    it("asks before running every linked test, and confirming starts it", async () => {
      const { hook, onRunCreated, redraw } = setup();
      await act(async () => {
        await hook.result.current.confirmTestRun(tests, true, "all");
      });
      redraw();
      expect(overEvalLimitMock).toHaveBeenCalledWith("token-1", 7, "tests");
      expect(screen.getByText("Run every test on this agent")).toBeInTheDocument();
      expect(screen.getByText(/start the evaluation on 7 tests/)).toBeInTheDocument();
      expect(startTestRunOrNotifyMock).not.toHaveBeenCalled();

      await act(async () => {
        screen.getByRole("button", { name: "Start the run" }).click();
      });
      redraw();
      expect(startTestRunOrNotifyMock).toHaveBeenCalledWith(
        "http://backend",
        "token-1",
        "agent-1",
        null,
        7,
      );
      expect(onRunCreated).toHaveBeenCalledWith("task-1");
      expect(screen.queryByText("Run every test on this agent")).toBeNull();
    });

    it("asks before running the selected tests, and cancelling runs nothing", async () => {
      const { hook, onRunCreated, redraw } = setup();
      await act(async () => {
        await hook.result.current.confirmTestRun(tests, false, "bulk");
      });
      redraw();
      expect(overEvalLimitMock).toHaveBeenCalledWith("token-1", 2, "tests");
      expect(screen.getByText("Run the selected tests")).toBeInTheDocument();

      await act(async () => {
        screen.getByRole("button", { name: "Cancel" }).click();
      });
      redraw();
      expect(screen.queryByText("Run the selected tests")).toBeNull();
      expect(startTestRunOrNotifyMock).not.toHaveBeenCalled();
      expect(onRunCreated).not.toHaveBeenCalled();
    });

    it("confirming the selected tests sends their ids", async () => {
      const { hook, onRunCreated, redraw } = setup();
      await act(async () => {
        await hook.result.current.confirmTestRun(tests, false, "bulk");
      });
      redraw();
      await act(async () => {
        screen.getByRole("button", { name: "Start the run" }).click();
      });
      expect(startTestRunOrNotifyMock).toHaveBeenCalledWith(
        "http://backend",
        "token-1",
        "agent-1",
        ["t1", "t2"],
        2,
      );
      expect(onRunCreated).toHaveBeenCalledWith("task-1");
    });

    it("does not ask when the run is over the limit", async () => {
      overEvalLimitMock.mockResolvedValue(true);
      const { hook, redraw } = setup();
      await act(async () => {
        await hook.result.current.confirmTestRun(tests, true, "all");
      });
      redraw();
      expect(screen.queryByText("Run every test on this agent")).toBeNull();
      expect(startTestRunOrNotifyMock).not.toHaveBeenCalled();
    });

    it("mentions the connection check on an unverified connection agent, and holds the run behind it", async () => {
      const { hook, redraw } = setup({
        agentType: "connection",
        connectionVerified: false,
      });
      await act(async () => {
        await hook.result.current.confirmTestRun(tests, false, "bulk");
      });
      redraw();
      expect(screen.getByText(/connection is checked first/)).toBeInTheDocument();
      await act(async () => {
        screen.getByRole("button", { name: "Start the run" }).click();
      });
      redraw();
      expect(startTestRunOrNotifyMock).not.toHaveBeenCalled();
      expect(screen.getByTestId("verify-dialog")).toBeInTheDocument();
    });
  });

  describe("openCompare", () => {
    it("resolves true and opens the picker when under the limit", async () => {
      const { hook, redraw } = setup();
      let opened: boolean | null = null;
      await act(async () => {
        opened = await hook.result.current.openCompare(tests, false);
      });
      redraw();
      expect(opened).toBe(true);
      expect(screen.getByTestId("benchmark-dialog")).toBeInTheDocument();
      expect(toast.error).not.toHaveBeenCalled();
    });

    it("resolves false when over the limit", async () => {
      overEvalLimitMock.mockResolvedValue(true);
      const { hook } = setup();
      let opened: boolean | null = null;
      await act(async () => {
        opened = await hook.result.current.openCompare(tests, false);
      });
      expect(opened).toBe(false);
    });

    it("refuses with a toast on an unverified connection agent", async () => {
      const { hook, redraw } = setup({
        agentType: "connection",
        connectionVerified: false,
      });
      let opened: boolean | null = null;
      await act(async () => {
        opened = await hook.result.current.openCompare(tests, false);
      });
      redraw();
      expect(opened).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        "Verify the agent connection before comparing models.",
      );
      expect(overEvalLimitMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("benchmark-dialog")).toBeNull();
      expect(screen.queryByTestId("enable-benchmark-dialog")).toBeNull();
    });

    it("refuses with a toast when benchmarking is off and cannot be turned on here", async () => {
      const { hook, redraw } = setup({
        agentType: "connection",
        connectionVerified: true,
        supportsBenchmark: false,
      });
      expect(hook.result.current.isBenchmarkDisabled).toBe(true);
      expect(hook.result.current.canEnableBenchmarkHere).toBe(false);
      let opened: boolean | null = null;
      await act(async () => {
        opened = await hook.result.current.openCompare(tests, false);
      });
      redraw();
      expect(opened).toBe(false);
      expect(toast.error).toHaveBeenCalledWith(
        "Turn benchmarking on in the Connection tab first.",
      );
      expect(overEvalLimitMock).not.toHaveBeenCalled();
      expect(screen.queryByTestId("benchmark-dialog")).toBeNull();
      expect(screen.queryByTestId("enable-benchmark-dialog")).toBeNull();
    });

    it("reports a cancelled picker as not started", async () => {
      const onComparisonClosed = jest.fn();
      const { hook, redraw } = setup({ onComparisonClosed });
      await act(async () => {
        await hook.result.current.openCompare(tests, false);
      });
      redraw();
      act(() => benchmarkProps?.onClose());
      expect(onComparisonClosed).toHaveBeenCalledWith(false);
    });
  });
});
