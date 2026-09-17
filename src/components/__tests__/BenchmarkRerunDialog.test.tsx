import { render, screen, renderHook, act } from "@/test-utils";
import {
  BenchmarkRerunDialog,
  useBenchmarkRerun,
  type BenchmarkRerunConfig,
} from "../BenchmarkRerunDialog";

// Capture the props the (mocked) BenchmarkResultsDialog receives so we can
// assert the wrapper forwards the rerun config and callbacks correctly.
let resultsProps: any = null;
jest.mock("../BenchmarkResultsDialog", () => ({
  __esModule: true,
  BenchmarkResultsDialog: (props: any) => {
    resultsProps = props;
    return props.isOpen ? (
      <div data-testid="benchmark-results-dialog">
        <button onClick={props.onClose}>close</button>
      </div>
    ) : null;
  },
}));

const config: BenchmarkRerunConfig = {
  agentUuid: "agent-1",
  agentName: "My Agent",
  models: ["gpt-4", "claude"],
  testUuids: ["tu-1", "tu-2"],
  testNames: ["Test One", "Test Two"],
  parallelModels: false,
};

describe("BenchmarkRerunDialog", () => {
  beforeEach(() => {
    resultsProps = null;
  });

  it("renders nothing when there is no active rerun config", () => {
    const { container } = render(
      <BenchmarkRerunDialog
        config={null}
        rerunKey={0}
        onClose={jest.fn()}
        onBenchmarkCreated={jest.fn()}
        onRerun={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(resultsProps).toBeNull();
  });

  it("forwards the config to a fresh (no-taskId) BenchmarkResultsDialog", () => {
    render(
      <BenchmarkRerunDialog
        config={config}
        rerunKey={1}
        onClose={jest.fn()}
        onBenchmarkCreated={jest.fn()}
        onRerun={jest.fn()}
      />,
    );
    expect(screen.getByTestId("benchmark-results-dialog")).toBeInTheDocument();
    expect(resultsProps.taskId).toBeUndefined();
    expect(resultsProps.models).toEqual(["gpt-4", "claude"]);
    expect(resultsProps.testUuids).toEqual(["tu-1", "tu-2"]);
    expect(resultsProps.testNames).toEqual(["Test One", "Test Two"]);
    expect(resultsProps.agentUuid).toBe("agent-1");
    // The rerun runs its models the way the run it came from did.
    expect(resultsProps.parallelModels).toBe(false);
  });

  it("passes the run config back with the new task id on creation", () => {
    const onBenchmarkCreated = jest.fn();
    render(
      <BenchmarkRerunDialog
        config={config}
        rerunKey={1}
        onClose={jest.fn()}
        onBenchmarkCreated={onBenchmarkCreated}
        onRerun={jest.fn()}
      />,
    );
    act(() => resultsProps.onBenchmarkCreated("task-99"));
    expect(onBenchmarkCreated).toHaveBeenCalledWith("task-99", config);
  });

  it("hands a re-rerun the updated request merged onto the config", () => {
    const onRerun = jest.fn();
    render(
      <BenchmarkRerunDialog
        config={config}
        rerunKey={1}
        onClose={jest.fn()}
        onBenchmarkCreated={jest.fn()}
        onRerun={onRerun}
      />,
    );
    act(() =>
      resultsProps.onRerun({
        models: ["gpt-4"],
        testUuids: ["tu-1"],
        testNames: ["Test One"],
        parallelModels: true,
      }),
    );
    expect(onRerun).toHaveBeenCalledWith({
      ...config,
      models: ["gpt-4"],
      testUuids: ["tu-1"],
      testNames: ["Test One"],
      parallelModels: true,
    });
  });

  it("hands the results window the Run and Compare actions for ticked tests", () => {
    const onRunTests = jest.fn();
    const onCompareTests = jest.fn();
    render(
      <BenchmarkRerunDialog
        config={config}
        rerunKey={1}
        onClose={jest.fn()}
        onBenchmarkCreated={jest.fn()}
        onRerun={jest.fn()}
        onRunTests={onRunTests}
        onCompareTests={onCompareTests}
      />,
    );
    const ticked = [{ uuid: "tu-1", name: "Test One" }];
    act(() => resultsProps.onRunTests(ticked));
    expect(onRunTests).toHaveBeenCalledWith(ticked);
    act(() => resultsProps.onCompareTests(ticked));
    expect(onCompareTests).toHaveBeenCalledWith(ticked);
  });

  it("leaves both actions out when the parent passes neither", () => {
    // The strip inside the window draws no buttons then, which is what a
    // caller that cannot start a run wants.
    render(
      <BenchmarkRerunDialog
        config={config}
        rerunKey={1}
        onClose={jest.fn()}
        onBenchmarkCreated={jest.fn()}
        onRerun={jest.fn()}
      />,
    );
    expect(resultsProps.onRunTests).toBeUndefined();
    expect(resultsProps.onCompareTests).toBeUndefined();
  });
});

describe("useBenchmarkRerun", () => {
  it("starts empty, populates on start, bumps the key each start, and clears", () => {
    const { result } = renderHook(() => useBenchmarkRerun());

    expect(result.current.config).toBeNull();
    const firstKey = result.current.key;

    act(() => result.current.start(config));
    expect(result.current.config).toEqual(config);
    const secondKey = result.current.key;
    expect(secondKey).not.toBe(firstKey);

    // A repeat start bumps the key again so the dialog remounts and re-POSTs.
    act(() => result.current.start({ ...config, models: ["claude"] }));
    expect(result.current.config?.models).toEqual(["claude"]);
    expect(result.current.key).not.toBe(secondKey);

    act(() => result.current.clear());
    expect(result.current.config).toBeNull();
  });
});
