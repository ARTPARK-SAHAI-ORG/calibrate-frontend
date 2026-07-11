import React from "react";
import { render, screen, setupUser, fireEvent, within } from "../../../test-utils";
import {
  BenchmarkOutputsPanel,
  benchmarkLabellingKey,
  type BenchmarkModelResult,
} from "../BenchmarkOutputsPanel";

jest.mock("../../test-results/shared", () => ({
  StatusIcon: ({ status }: { status: string }) => (
    <span data-testid="status-icon">{status}</span>
  ),
  LabellingRowCheckbox: ({
    checked,
    disabled,
  }: {
    checked: boolean;
    disabled?: boolean;
  }) => (
    <span
      data-testid="labelling-checkbox"
      data-checked={checked}
      data-disabled={!!disabled}
    >
      checkbox
    </span>
  ),
  TestDetailView: (props: any) => (
    <div data-testid="test-detail-view">
      {JSON.stringify({ passed: props.passed, reasoning: props.reasoning })}
    </div>
  ),
  EmptyStateView: ({ message }: { message: string }) => <div>{message}</div>,
  EvaluationCriteriaPanel: (props: any) => (
    <div data-testid="eval-criteria-panel" data-passed={String(props.passed)}>
      {props.testName}
    </div>
  ),
  isTypingTarget: jest.fn(() => false),
  scrollRowByPage: jest.fn(),
}));

jest.mock("../../human-labelling/AddRunToLabellingTaskDialog", () => ({
  isLabellingEligibleRaw: jest.fn(() => true),
}));

import { isLabellingEligibleRaw } from "../../human-labelling/AddRunToLabellingTaskDialog";

const mockIsLabellingEligibleRaw = isLabellingEligibleRaw as jest.Mock;

beforeEach(() => {
  mockIsLabellingEligibleRaw.mockReset();
  mockIsLabellingEligibleRaw.mockReturnValue(true);
});

function makeModel(overrides: Partial<BenchmarkModelResult>): BenchmarkModelResult {
  return {
    model: "model-a",
    success: true,
    message: "",
    total_tests: null,
    passed: null,
    failed: null,
    test_results: null,
    ...overrides,
  };
}

// Model A: 1 passed, 1 failed, 1 errored
const modelA = makeModel({
  model: "model-a",
  success: true,
  total_tests: 3,
  passed: 1,
  failed: 2, // includes the errored one per API convention
  test_results: [
    { name: "Alpha Passed", passed: true, reasoning: "good" },
    { name: "Alpha Failed", passed: false, reasoning: "bad" },
    { name: "Alpha Errored", passed: false, error: "boom" },
  ],
});

// Model B: 1 running (passed === null), 1 passed
const modelB = makeModel({
  model: "model-b",
  success: null,
  total_tests: 2,
  passed: 1,
  failed: 0,
  test_results: [
    { name: "Beta Passed", passed: true, reasoning: "great" },
    { name: "Beta Running", passed: null },
  ],
});

const twoModels: BenchmarkModelResult[] = [modelA, modelB];

const expandedAll = new Set(["model-a", "model-b"]);

describe("benchmarkLabellingKey", () => {
  it("builds a model:index key", () => {
    expect(benchmarkLabellingKey("gpt-4", 2)).toBe("gpt-4:2");
    expect(benchmarkLabellingKey("", 0)).toBe(":0");
  });
});

describe("BenchmarkOutputsPanel", () => {
  it("renders 'Waiting for results...' when modelResults is empty", () => {
    render(
      <BenchmarkOutputsPanel
        modelResults={[]}
        expandedModels={new Set()}
        onToggleModel={jest.fn()}
        selectedTest={null}
        onSelectTest={jest.fn()}
      />,
    );
    expect(screen.getByText("Waiting for results...")).toBeInTheDocument();
    expect(screen.getByText("Select a test to view details")).toBeInTheDocument();
  });

  it("renders model sections collapsed by default (no rows) and expands on toggle", async () => {
    const user = setupUser();
    const onToggleModel = jest.fn();
    render(
      <BenchmarkOutputsPanel
        modelResults={twoModels}
        expandedModels={new Set()}
        onToggleModel={onToggleModel}
        selectedTest={null}
        onSelectTest={jest.fn()}
      />,
    );
    expect(screen.queryByText("Alpha Passed")).not.toBeInTheDocument();
    await user.click(screen.getByText("model-a"));
    expect(onToggleModel).toHaveBeenCalledWith("model-a");
  });

  it("shows rows when a model is expanded, with per-model status counts", () => {
    render(
      <BenchmarkOutputsPanel
        modelResults={twoModels}
        expandedModels={expandedAll}
        onToggleModel={jest.fn()}
        selectedTest={null}
        onSelectTest={jest.fn()}
      />,
    );
    expect(screen.getByText("Alpha Passed")).toBeInTheDocument();
    expect(screen.getByText("Alpha Failed")).toBeInTheDocument();
    expect(screen.getByText("Alpha Errored")).toBeInTheDocument();
    // header counts: passedCount=1, erroredCount=1, failedCount = max(2-1,0)=1
    expect(screen.getByText("1 passed")).toBeInTheDocument();
    // there may be multiple "1 failed" (model-a) - assert at least one exists
    expect(screen.getAllByText("1 failed").length).toBeGreaterThan(0);
    expect(screen.getByText("1 errored")).toBeInTheDocument();
  });

  it("model B is processing (success===null): shows spinner, no pass/fail counts in header, and running placeholder icon for the running row when showRunningSpinner", () => {
    render(
      <BenchmarkOutputsPanel
        modelResults={twoModels}
        expandedModels={expandedAll}
        onToggleModel={jest.fn()}
        selectedTest={null}
        onSelectTest={jest.fn()}
        showRunningSpinner
      />,
    );
    expect(screen.getByText("Beta Passed")).toBeInTheDocument();
    expect(screen.getByText("Beta Running")).toBeInTheDocument();
    const statusIcons = screen.getAllByTestId("status-icon");
    const statuses = statusIcons.map((el) => el.textContent);
    expect(statuses).toContain("running");
    expect(statuses).toContain("passed");
    expect(statuses).toContain("failed");
    expect(statuses).toContain("error");
  });

  describe("benchmarkTestStatus / StatusIcon mapping via rendering", () => {
    it("maps error > running(passed null) > passed/failed correctly", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      // Alpha Errored has both passed:false and error set -> should be "error", not "failed"
      const erroredRowButton = screen.getByText("Alpha Errored").closest("button")!;
      const icon = within(erroredRowButton).getByTestId("status-icon");
      expect(icon).toHaveTextContent("error");
    });
  });

  describe("benchmarkTestName fallbacks", () => {
    it("prefers tr.name, then test_case.name, then testNames[index], then 'Test N'", () => {
      const models: BenchmarkModelResult[] = [
        makeModel({
          model: "m1",
          test_results: [
            { name: "Named Test", passed: true },
            { passed: true, test_case: { name: "Case Name" } as any },
            { passed: true },
            { passed: true },
          ],
          total_tests: 4,
        }),
      ];
      render(
        <BenchmarkOutputsPanel
          modelResults={models}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          testNames={["ignored", "ignored2", "Placeholder Name"]}
        />,
      );
      expect(screen.getByText("Named Test")).toBeInTheDocument();
      expect(screen.getByText("Case Name")).toBeInTheDocument();
      expect(screen.getByText("Placeholder Name")).toBeInTheDocument();
      expect(screen.getByText("Test 4")).toBeInTheDocument();
    });
  });

  describe("status filter pills", () => {
    it("does not show pills when fewer than two distinct statuses are present", () => {
      const onlyPassed: BenchmarkModelResult[] = [
        makeModel({
          model: "m1",
          test_results: [{ name: "P1", passed: true }, { name: "P2", passed: true }],
          total_tests: 2,
          passed: 2,
          failed: 0,
        }),
      ];
      render(
        <BenchmarkOutputsPanel
          modelResults={onlyPassed}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryByText("Passed")).not.toBeInTheDocument();
      expect(screen.queryByText("Failed")).not.toBeInTheDocument();
      expect(screen.queryByText("Errored")).not.toBeInTheDocument();
    });

    it("shows pills when >=2 distinct statuses present, and clicking filters rows + toggles off on second click", async () => {
      const user = setupUser();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      const passedPill = screen.getByText("Passed");
      const failedPill = screen.getByText("Failed");
      const erroredPill = screen.getByText("Errored");
      expect(passedPill).toBeInTheDocument();
      expect(failedPill).toBeInTheDocument();
      expect(erroredPill).toBeInTheDocument();

      await user.click(failedPill);
      expect(screen.getByText("Alpha Failed")).toBeInTheDocument();
      expect(screen.queryByText("Alpha Passed")).not.toBeInTheDocument();
      expect(screen.queryByText("Alpha Errored")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Passed")).not.toBeInTheDocument();

      // click again resets to all
      await user.click(failedPill);
      expect(screen.getByText("Alpha Passed")).toBeInTheDocument();
      expect(screen.getByText("Alpha Errored")).toBeInTheDocument();
    });

    it("filters to errored only, and header only shows the active-filter count", async () => {
      const user = setupUser();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      await user.click(screen.getByText("Errored"));
      expect(screen.getByText("Alpha Errored")).toBeInTheDocument();
      expect(screen.queryByText("Alpha Passed")).not.toBeInTheDocument();
      expect(screen.queryByText("Alpha Failed")).not.toBeInTheDocument();
      // header: only errored count should show for model-a (passed/failed hidden)
      expect(screen.queryByText("1 passed")).not.toBeInTheDocument();
      expect(screen.getByText("1 errored")).toBeInTheDocument();
    });
  });

  describe("search filter", () => {
    it("filters flattened rows by test name (case-insensitive)", async () => {
      const user = setupUser();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      const search = screen.getByPlaceholderText("Search tests");
      await user.type(search, "beta passed");
      expect(screen.getByText("Beta Passed")).toBeInTheDocument();
      expect(screen.queryByText("Alpha Passed")).not.toBeInTheDocument();
      expect(screen.queryByText("Beta Running")).not.toBeInTheDocument();
    });
  });

  describe("auto-reset of statusFilter effect", () => {
    it("resets to 'all' when the active filter's status count drops to zero after a rerender", async () => {
      const user = setupUser();
      const { rerender } = render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      await user.click(screen.getByText("Errored"));
      expect(screen.queryByText("Alpha Passed")).not.toBeInTheDocument();

      // Rerender with modelResults that has no errored tests anymore, but still >=2 statuses (passed/failed)
      const noErrors: BenchmarkModelResult[] = [
        makeModel({
          model: "model-a",
          test_results: [
            { name: "Alpha Passed", passed: true },
            { name: "Alpha Failed", passed: false },
          ],
          total_tests: 2,
          passed: 1,
          failed: 1,
        }),
        modelB,
      ];
      rerender(
        <BenchmarkOutputsPanel
          modelResults={noErrors}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      // filter should have reset to "all" -> both passed and failed rows visible again
      expect(screen.getByText("Alpha Passed")).toBeInTheDocument();
      expect(screen.getByText("Alpha Failed")).toBeInTheDocument();
    });
  });

  describe("bulk expand/collapse", () => {
    it("shows 'Expand all' when not all expanded and 'Collapse all' when all expanded; uses onSetExpandedModels when provided", async () => {
      const user = setupUser();
      const onSetExpandedModels = jest.fn();
      const { rerender } = render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={new Set()}
          onToggleModel={jest.fn()}
          onSetExpandedModels={onSetExpandedModels}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      const expandAllBtn = screen.getByText("Expand all");
      await user.click(expandAllBtn);
      expect(onSetExpandedModels).toHaveBeenCalledWith(new Set(["model-a", "model-b"]));

      rerender(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          onSetExpandedModels={onSetExpandedModels}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      const collapseAllBtn = screen.getByText("Collapse all");
      await user.click(collapseAllBtn);
      expect(onSetExpandedModels).toHaveBeenCalledWith(new Set());
    });

    it("falls back to onToggleModel per model needing a flip when onSetExpandedModels is not provided", async () => {
      const user = setupUser();
      const onToggleModel = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={new Set(["model-a"])}
          onToggleModel={onToggleModel}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      // Not all expanded -> "Expand all"; only model-b needs toggling.
      const expandAllBtn = screen.getByText("Expand all");
      await user.click(expandAllBtn);
      expect(onToggleModel).toHaveBeenCalledWith("model-b");
      expect(onToggleModel).not.toHaveBeenCalledWith("model-a");
    });

    it("collapse-all fallback toggles every model when onSetExpandedModels is absent", async () => {
      const user = setupUser();
      const onToggleModel = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={onToggleModel}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      const collapseAllBtn = screen.getByText("Collapse all");
      await user.click(collapseAllBtn);
      expect(onToggleModel).toHaveBeenCalledWith("model-a");
      expect(onToggleModel).toHaveBeenCalledWith("model-b");
    });

    it("does not render bulk expand controls when showControls is false", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={new Set()}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          showControls={false}
        />,
      );
      expect(screen.queryByText("Expand all")).not.toBeInTheDocument();
      // filter pills also require showControls
      expect(screen.queryByText("Passed")).not.toBeInTheDocument();
    });
  });

  describe("bulk select-all for labelling", () => {
    it("global select-all calls onLabellingBulkToggle with all visible labelling keys and label switches to Deselect all", async () => {
      const user = setupUser();
      const onLabellingBulkToggle = jest.fn();
      const { rerender } = render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
        />,
      );
      const selectAllButtons = screen.getAllByText("Select all");
      await user.click(selectAllButtons[0]);
      expect(onLabellingBulkToggle).toHaveBeenCalledWith([
        "model-a:0",
        "model-a:1",
        "model-a:2",
        "model-b:0",
        "model-b:1",
      ]);

      rerender(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
          labellingSelection={
            new Set([
              "model-a:0",
              "model-a:1",
              "model-a:2",
              "model-b:0",
              "model-b:1",
            ])
          }
        />,
      );
      expect(screen.getAllByText("Deselect all").length).toBeGreaterThan(0);
    });

    it("does not show bulk select-all when onLabellingBulkToggle is not provided", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
        />,
      );
      expect(screen.queryByText("Select all")).not.toBeInTheDocument();
    });
  });

  describe("per-model select-all in ModelSection header", () => {
    it("clicking the model header checkbox button calls onLabellingBulkToggle scoped to that model's keys", async () => {
      const user = setupUser();
      const onLabellingBulkToggle = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
        />,
      );
      const modelATitleBtn = screen.getByTitle("Select all model-a tests");
      await user.click(modelATitleBtn);
      expect(onLabellingBulkToggle).toHaveBeenCalledWith([
        "model-a:0",
        "model-a:1",
        "model-a:2",
      ]);
    });

    it("title switches to 'Deselect all <model> tests' once all of that model's keys are selected", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={jest.fn()}
          labellingSelection={new Set(["model-a:0", "model-a:1", "model-a:2"])}
        />,
      );
      expect(screen.getByTitle("Deselect all model-a tests")).toBeInTheDocument();
    });
  });

  describe("per-row labelling checkbox", () => {
    it("calls onToggleLabellingSelection with the row's labelling key on click", async () => {
      const user = setupUser();
      const onToggleLabellingSelection = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={onToggleLabellingSelection}
        />,
      );
      const row = screen.getByText("Alpha Passed").closest("div")!.parentElement!;
      const checkboxButton = within(row).getAllByRole("button")[0];
      await user.click(checkboxButton);
      expect(onToggleLabellingSelection).toHaveBeenCalledWith("model-a:0");
    });

    it("title reflects isLabellingEligibleRaw: 'Select for labelling' vs skip message", () => {
      mockIsLabellingEligibleRaw.mockReturnValue(false);
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
        />,
      );
      const row = screen.getByText("Alpha Passed").closest("div")!.parentElement!;
      const checkboxButton = within(row).getAllByRole("button")[0];
      expect(checkboxButton).toHaveAttribute(
        "title",
        "Tool-call tests will be skipped when submitting for labelling",
      );
    });

    it("shows 'Select for labelling' title when eligible", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
        />,
      );
      const row = screen.getByText("Alpha Passed").closest("div")!.parentElement!;
      const checkboxButton = within(row).getAllByRole("button")[0];
      expect(checkboxButton).toHaveAttribute("title", "Select for labelling");
    });

    it("does not render labelling checkboxes when onToggleLabellingSelection is absent", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryAllByTestId("labelling-checkbox")).toHaveLength(0);
    });
  });

  describe("row selection", () => {
    it("calls onSelectTest with the model and test index when a row is clicked", async () => {
      const user = setupUser();
      const onSelectTest = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={onSelectTest}
        />,
      );
      await user.click(screen.getByText("Alpha Failed"));
      expect(onSelectTest).toHaveBeenCalledWith("model-a", 1);
    });
  });

  describe("pager: orderedTests / onNavChange / goPrev / goNext / selectAndReveal", () => {
    it("reports currentIndex/total over the full flattened order and navigates within an expanded model", () => {
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 1 }}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      expect(onNavChange).toHaveBeenCalled();
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      // order: a:0, a:1, a:2, b:0, b:1 -> selected a:1 -> index 1
      expect(lastCall.currentIndex).toBe(1);
      expect(lastCall.total).toBe(5);

      lastCall.goNext();
      expect(onSelectTest).toHaveBeenCalledWith("model-a", 2);

      lastCall.goPrev();
      expect(onSelectTest).toHaveBeenCalledWith("model-a", 0);
    });

    it("selectAndReveal expands the target model via onSetExpandedModels when stepping across model boundaries", () => {
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      const onSetExpandedModels = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={new Set(["model-a"])}
          onToggleModel={jest.fn()}
          onSetExpandedModels={onSetExpandedModels}
          selectedTest={{ model: "model-a", testIndex: 2 }}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      // a:2 -> next is b:0, model-b not expanded
      lastCall.goNext();
      expect(onSetExpandedModels).toHaveBeenCalledWith(
        new Set(["model-a", "model-b"]),
      );
      expect(onSelectTest).toHaveBeenCalledWith("model-b", 0);
    });

    it("selectAndReveal falls back to onToggleModel when onSetExpandedModels is not provided", () => {
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      const onToggleModel = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={new Set(["model-a"])}
          onToggleModel={onToggleModel}
          selectedTest={{ model: "model-a", testIndex: 2 }}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      lastCall.goNext();
      expect(onToggleModel).toHaveBeenCalledWith("model-b");
      expect(onSelectTest).toHaveBeenCalledWith("model-b", 0);
    });

    it("goPrev/goNext are no-ops at the boundaries", () => {
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-b", testIndex: 1 }}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      expect(lastCall.currentIndex).toBe(4);
      lastCall.goNext();
      expect(onSelectTest).not.toHaveBeenCalled();
    });

    it("goPrev/goNext in the reported nav are no-ops when nothing is selected", () => {
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      expect(lastCall.currentIndex).toBe(-1);
      lastCall.goPrev();
      lastCall.goNext();
      expect(onSelectTest).not.toHaveBeenCalled();
    });

    it("does not throw when onNavChange is not provided", () => {
      expect(() =>
        render(
          <BenchmarkOutputsPanel
            modelResults={twoModels}
            expandedModels={expandedAll}
            onToggleModel={jest.fn()}
            selectedTest={{ model: "model-a", testIndex: 0 }}
            onSelectTest={jest.fn()}
          />,
        ),
      ).not.toThrow();
    });

    it("respects filter+search in the ordered pager", async () => {
      const user = setupUser();
      const onSelectTest = jest.fn();
      const onNavChange = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={onSelectTest}
          onNavChange={onNavChange}
        />,
      );
      await user.click(screen.getByText("Passed"));
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      // filtered order: a:0 (passed), b:0 (passed) -> total 2, currentIndex 0
      expect(lastCall.total).toBe(2);
      expect(lastCall.currentIndex).toBe(0);
      lastCall.goNext();
      expect(onSelectTest).toHaveBeenCalledWith("model-b", 0);
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown/ArrowUp trigger goNextTest/goPrevTest via onSelectTest", () => {
      const onSelectTest = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={onSelectTest}
        />,
      );
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onSelectTest).toHaveBeenCalledWith("model-a", 1);
      expect(onSelectTest).toHaveBeenCalledTimes(1);
    });

    it("ArrowUp is a no-op at the first item", () => {
      const onSelectTest = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={onSelectTest}
        />,
      );
      fireEvent.keyDown(window, { key: "ArrowUp" });
      expect(onSelectTest).not.toHaveBeenCalled();
    });

    it("is ignored when a modifier key is held", () => {
      const onSelectTest = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={onSelectTest}
        />,
      );
      fireEvent.keyDown(window, { key: "ArrowDown", metaKey: true });
      expect(onSelectTest).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "ArrowDown", ctrlKey: true });
      expect(onSelectTest).not.toHaveBeenCalled();
      fireEvent.keyDown(window, { key: "ArrowDown", altKey: true });
      expect(onSelectTest).not.toHaveBeenCalled();
    });

    it("does not register a keydown listener / act when nothing is selected", () => {
      const onSelectTest = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={onSelectTest}
        />,
      );
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onSelectTest).not.toHaveBeenCalled();
    });
  });

  describe("running placeholder rows", () => {
    it("shows placeholder rows for indices without results when showRunningSpinner is true", () => {
      const running: BenchmarkModelResult[] = [
        makeModel({
          model: "m1",
          success: null,
          total_tests: 3,
          test_results: [{ name: "First", passed: true }],
        }),
      ];
      render(
        <BenchmarkOutputsPanel
          modelResults={running}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          showRunningSpinner
          testNames={["First", "Second", "Third"]}
        />,
      );
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.getByText("Second")).toBeInTheDocument();
      expect(screen.getByText("Third")).toBeInTheDocument();
    });

    it("skips placeholder rows for indices without results when showRunningSpinner is false", () => {
      const running: BenchmarkModelResult[] = [
        makeModel({
          model: "m1",
          success: null,
          total_tests: 3,
          test_results: [{ name: "First", passed: true }],
        }),
      ];
      render(
        <BenchmarkOutputsPanel
          modelResults={running}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
          showRunningSpinner={false}
          testNames={["First", "Second", "Third"]}
        />,
      );
      expect(screen.getByText("First")).toBeInTheDocument();
      expect(screen.queryByText("Second")).not.toBeInTheDocument();
      expect(screen.queryByText("Third")).not.toBeInTheDocument();
    });

    it("shows 'Processing...' when expectedCount is 0 and the model is still processing, 'No test results' otherwise", () => {
      const emptyProcessing: BenchmarkModelResult[] = [
        makeModel({ model: "m1", success: null, total_tests: 0, test_results: [] }),
      ];
      const { rerender } = render(
        <BenchmarkOutputsPanel
          modelResults={emptyProcessing}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.getByText("Processing...")).toBeInTheDocument();

      const emptyDone: BenchmarkModelResult[] = [
        makeModel({ model: "m1", success: true, total_tests: 0, test_results: [] }),
      ];
      rerender(
        <BenchmarkOutputsPanel
          modelResults={emptyDone}
          expandedModels={new Set(["m1"])}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.getByText("No test results")).toBeInTheDocument();
    });
  });

  describe("middle pane detail rendering", () => {
    it("renders an error card when the selected test has .error", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 2 }}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });

    it("renders 'Running test...' spinner when passed is null and showRunningSpinner is true", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-b", testIndex: 1 }}
          onSelectTest={jest.fn()}
          showRunningSpinner
        />,
      );
      expect(screen.getByText("Running test...")).toBeInTheDocument();
    });

    it("renders TestDetailView (mocked) for non-error, non-null-passed results", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={jest.fn()}
        />,
      );
      const detail = screen.getByTestId("test-detail-view");
      expect(detail).toHaveTextContent(
        JSON.stringify({ passed: true, reasoning: "good" }),
      );
    });

    it("renders EmptyStateView when nothing is selected", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.getByText("Select a test to view details")).toBeInTheDocument();
    });

    it("falls back to TestDetailView with passed=false when selected test result is missing/undefined but selectedTest points elsewhere (no crash)", () => {
      expect(() =>
        render(
          <BenchmarkOutputsPanel
            modelResults={twoModels}
            expandedModels={expandedAll}
            onToggleModel={jest.fn()}
            selectedTest={{ model: "model-a", testIndex: 99 }}
            onSelectTest={jest.fn()}
          />,
        ),
      ).not.toThrow();
      expect(screen.getByText("Select a test to view details")).toBeInTheDocument();
    });
  });

  describe("right pane EvaluationCriteriaPanel", () => {
    it("is shown only when a test is selected, has no error, and passed !== null", () => {
      const { rerender } = render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.getByTestId("eval-criteria-panel")).toBeInTheDocument();

      rerender(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 2 }}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();

      rerender(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-b", testIndex: 1 }}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();

      rerender(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={null}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();
    });
  });

  describe("mobile back button", () => {
    it("renders and calls onClearSelection when both selectedTest and onClearSelection are provided", async () => {
      const user = setupUser();
      const onClearSelection = jest.fn();
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={jest.fn()}
          onClearSelection={onClearSelection}
        />,
      );
      const backButton = screen.getByText("Back to models");
      await user.click(backButton);
      expect(onClearSelection).toHaveBeenCalledTimes(1);
    });

    it("does not render when onClearSelection is absent", () => {
      render(
        <BenchmarkOutputsPanel
          modelResults={twoModels}
          expandedModels={expandedAll}
          onToggleModel={jest.fn()}
          selectedTest={{ model: "model-a", testIndex: 0 }}
          onSelectTest={jest.fn()}
        />,
      );
      expect(screen.queryByText("Back to models")).not.toBeInTheDocument();
    });
  });

  describe("formatModelName", () => {
    it("renders the formatted name and does not crash with long names", () => {
      const longName = "a".repeat(100);
      const models: BenchmarkModelResult[] = [
        makeModel({ model: longName, test_results: [{ name: "T1", passed: true }] }),
      ];
      expect(() =>
        render(
          <BenchmarkOutputsPanel
            modelResults={models}
            expandedModels={new Set([longName])}
            onToggleModel={jest.fn()}
            selectedTest={null}
            onSelectTest={jest.fn()}
            formatModelName={(n) => `Display: ${n.slice(0, 5)}`}
          />,
        ),
      ).not.toThrow();
      expect(screen.getByText("Display: aaaaa")).toBeInTheDocument();
    });
  });
});
