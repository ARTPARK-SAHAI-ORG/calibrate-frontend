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

  it("hands a re-rerun the updated models/testUuids/testNames merged onto the config", () => {
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
    act(() => resultsProps.onRerun(["gpt-4"], ["tu-1"], ["Test One"]));
    expect(onRerun).toHaveBeenCalledWith({
      ...config,
      models: ["gpt-4"],
      testUuids: ["tu-1"],
      testNames: ["Test One"],
    });
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
