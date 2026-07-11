import React from "react";
import { render, screen, setupUser, fireEvent, within } from "../../../test-utils";
import {
  TestRunOutputsPanel,
  type TestRunResult,
} from "../TestRunOutputsPanel";

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
  TestDetailView: (props: { passed?: boolean; reasoning?: string }) => (
    <div data-testid="test-detail-view">
      {JSON.stringify({ passed: props.passed, reasoning: props.reasoning })}
    </div>
  ),
  EmptyStateView: ({ message }: { message: string }) => <div>{message}</div>,
  EvaluationCriteriaPanel: (props: {
    passed?: boolean | null;
    testName?: string;
  }) => (
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

function makeResult(overrides: Partial<TestRunResult>): TestRunResult {
  return {
    id: "id",
    name: "name",
    status: "passed",
    ...overrides,
  };
}

const passedResult = makeResult({
  id: "p1",
  name: "Passed Test One",
  status: "passed",
  reasoning: "looks good",
});
const failedResult = makeResult({
  id: "f1",
  name: "Failed Test One",
  status: "failed",
  reasoning: "did not match",
});
const erroredResult = makeResult({
  id: "e1",
  name: "Errored Test One",
  status: "failed",
  error: "boom",
});
const pendingResult = makeResult({
  id: "pd1",
  name: "Pending Test One",
  status: "pending",
});
const queuedResult = makeResult({
  id: "q1",
  name: "Queued Test One",
  status: "queued",
});
const runningResult = makeResult({
  id: "r1",
  name: "Running Test One",
  status: "running",
});

const allResults: TestRunResult[] = [
  passedResult,
  failedResult,
  erroredResult,
  pendingResult,
  queuedResult,
  runningResult,
];

beforeEach(() => {
  mockIsLabellingEligibleRaw.mockReset();
  mockIsLabellingEligibleRaw.mockReturnValue(true);
});

describe("TestRunOutputsPanel", () => {
  it("renders grouped list with correct counts, only non-empty groups", () => {
    render(
      <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={jest.fn()} />,
    );
    expect(screen.getByText("Failed (1)")).toBeInTheDocument();
    expect(screen.getByText("Errored (1)")).toBeInTheDocument();
    expect(screen.getByText("Passed (1)")).toBeInTheDocument();
    expect(screen.getByText("Queued (1)")).toBeInTheDocument();
    expect(screen.getByText("Running (1)")).toBeInTheDocument();
    expect(screen.getByText("Pending (1)")).toBeInTheDocument();
  });

  it("does not render a group with zero items", () => {
    render(
      <TestRunOutputsPanel results={[passedResult]} selectedId={null} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText(/Failed \(/)).not.toBeInTheDocument();
    expect(screen.getByText("Passed (1)")).toBeInTheDocument();
  });

  it("toggles group collapse when the header is clicked, hiding items", async () => {
    const user = setupUser();
    render(
      <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={jest.fn()} />,
    );
    expect(screen.getByText("Passed Test One")).toBeInTheDocument();
    await user.click(screen.getByText("Passed (1)"));
    expect(screen.queryByText("Passed Test One")).not.toBeInTheDocument();
    await user.click(screen.getByText("Passed (1)"));
    expect(screen.getByText("Passed Test One")).toBeInTheDocument();
  });

  it("filters the list by name (case-insensitive substring)", async () => {
    const user = setupUser();
    render(
      <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={jest.fn()} />,
    );
    const search = screen.getByPlaceholderText("Search tests");
    await user.type(search, "passed test");
    expect(screen.getByText("Passed Test One")).toBeInTheDocument();
    expect(screen.queryByText("Failed Test One")).not.toBeInTheDocument();
  });

  it("shows 'No tests match' message when the search query has no results", async () => {
    const user = setupUser();
    render(
      <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={jest.fn()} />,
    );
    const search = screen.getByPlaceholderText("Search tests");
    await user.type(search, "nonexistent-xyz");
    expect(
      screen.getByText((content) => content.includes("No tests match")),
    ).toBeInTheDocument();
  });

  it("calls onSelect with the result id when a row is clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    render(
      <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={onSelect} />,
    );
    await user.click(screen.getByText("Passed Test One"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });

  it("renders pending detail message", () => {
    render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="pd1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Test is pending")).toBeInTheDocument();
  });

  it("renders queued detail message", () => {
    render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="q1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Test is queued")).toBeInTheDocument();
  });

  it("renders running detail message", () => {
    render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="r1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Running test")).toBeInTheDocument();
  });

  it("renders an error card when the result has .error set, regardless of status", () => {
    render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="e1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders SharedTestDetailView (mocked) for passed/failed non-errored results", () => {
    render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="p1"
        onSelect={jest.fn()}
      />,
    );
    const detail = screen.getByTestId("test-detail-view");
    expect(detail).toHaveTextContent(JSON.stringify({ passed: false, reasoning: "looks good" }));
  });

  it("shows EvaluationCriteriaPanel only for passed/failed non-errored selected results", () => {
    const { rerender } = render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="p1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId("eval-criteria-panel")).toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="f1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByTestId("eval-criteria-panel")).toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="e1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="pd1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="q1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="r1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByTestId("eval-criteria-panel")).not.toBeInTheDocument();
  });

  it("passes the correct passed prop to EvaluationCriteriaPanel for passed vs failed", () => {
    const { rerender } = render(
      <TestRunOutputsPanel results={allResults} selectedId="p1" onSelect={jest.fn()} />,
    );
    expect(screen.getByTestId("eval-criteria-panel")).toHaveAttribute("data-passed", "true");

    rerender(
      <TestRunOutputsPanel results={allResults} selectedId="f1" onSelect={jest.fn()} />,
    );
    expect(screen.getByTestId("eval-criteria-panel")).toHaveAttribute("data-passed", "false");
  });

  it("renders the mobile back button only when both selectedId and onClearSelection are provided, and calls the callback", async () => {
    const user = setupUser();
    const onClearSelection = jest.fn();
    const { rerender } = render(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="p1"
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByText("Back to tests")).not.toBeInTheDocument();

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId="p1"
        onSelect={jest.fn()}
        onClearSelection={onClearSelection}
      />,
    );
    const backButton = screen.getByText("Back to tests");
    expect(backButton).toBeInTheDocument();
    await user.click(backButton);
    expect(onClearSelection).toHaveBeenCalledTimes(1);

    rerender(
      <TestRunOutputsPanel
        results={allResults}
        selectedId={null}
        onSelect={jest.fn()}
        onClearSelection={onClearSelection}
      />,
    );
    expect(screen.queryByText("Back to tests")).not.toBeInTheDocument();
  });

  it("renders empty state message when results is empty", () => {
    render(<TestRunOutputsPanel results={[]} selectedId={null} onSelect={jest.fn()} />);
    expect(screen.getByText("Select a test to view details")).toBeInTheDocument();
    expect(screen.queryByText(/Failed \(/)).not.toBeInTheDocument();
  });

  describe("labelling checkboxes", () => {
    it("shows checkboxes when onToggleLabellingSelection is provided and calls it for selectable rows", async () => {
      const user = setupUser();
      const onToggleLabellingSelection = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={onToggleLabellingSelection}
        />,
      );
      const checkboxes = screen.getAllByTestId("labelling-checkbox");
      expect(checkboxes.length).toBeGreaterThan(0);

      // Find the passed row's checkbox button (selectable).
      const rowContainer = screen.getByText("Passed Test One").closest("div")!;
      const checkboxButton = within(rowContainer).getAllByRole("button")[0];
      await user.click(checkboxButton);
      expect(onToggleLabellingSelection).toHaveBeenCalledWith("p1");
    });

    it("does not call onToggleLabellingSelection for a non-selectable (pending/queued/running) row and renders it disabled", async () => {
      const user = setupUser();
      const onToggleLabellingSelection = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={onToggleLabellingSelection}
        />,
      );
      const rowContainer = screen.getByText("Pending Test One").closest("div")!;
      const checkboxButton = within(rowContainer).getAllByRole("button")[0];
      expect(checkboxButton).toBeDisabled();
      await user.click(checkboxButton);
      expect(onToggleLabellingSelection).not.toHaveBeenCalled();
    });

    it("shows 'Tool-call tests will be skipped...' title when isLabellingEligibleRaw returns false for a selectable row", () => {
      mockIsLabellingEligibleRaw.mockReturnValue(false);
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
        />,
      );
      const rowContainer = screen.getByText("Passed Test One").closest("div")!;
      const checkboxButton = within(rowContainer).getAllByRole("button")[0];
      expect(checkboxButton).toHaveAttribute(
        "title",
        "Tool-call tests will be skipped when submitting for labelling",
      );
    });
  });

  describe("bulk select all / deselect all", () => {
    it("global select-all calls onLabellingBulkToggle with the expected visible selectable ids", async () => {
      const user = setupUser();
      const onLabellingBulkToggle = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
        />,
      );
      const selectAllButtons = screen.getAllByText("Select all");
      // The first one rendered is the global (top) select-all.
      await user.click(selectAllButtons[0]);
      expect(onLabellingBulkToggle).toHaveBeenCalledWith(
        expect.arrayContaining(["p1", "f1", "e1"]),
      );
      const calledIds = onLabellingBulkToggle.mock.calls[0][0];
      expect(calledIds).toHaveLength(3);
    });

    it("global button label switches to 'Deselect all' when all visible selectable ids are already selected", () => {
      const onLabellingBulkToggle = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
          labellingSelection={new Set(["p1", "f1", "e1"])}
        />,
      );
      expect(screen.getAllByText("Deselect all").length).toBeGreaterThan(0);
    });

    it("per-group select-all only renders for failed/errored/passed groups and calls onLabellingBulkToggle with that group's ids", async () => {
      const user = setupUser();
      const onLabellingBulkToggle = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={onLabellingBulkToggle}
        />,
      );
      const passedHeader = screen.getByText("Passed (1)").closest("div")!
        .parentElement!;
      const groupSelectAllButton = within(passedHeader).getByTitle(
        "Select all passed",
      );
      await user.click(groupSelectAllButton);
      expect(onLabellingBulkToggle).toHaveBeenCalledWith(["p1"]);

      // Queued group (not in labellingGroupKeys) should have no such button.
      const queuedHeader = screen.getByText("Queued (1)").closest("div")!
        .parentElement!;
      expect(
        within(queuedHeader).queryByTitle(/Select all|Deselect all/),
      ).not.toBeInTheDocument();
    });

    it("does not render the global select-all when there are no selectable ids", () => {
      render(
        <TestRunOutputsPanel
          results={[pendingResult, queuedResult, runningResult]}
          selectedId={null}
          onSelect={jest.fn()}
          onToggleLabellingSelection={jest.fn()}
          onLabellingBulkToggle={jest.fn()}
        />,
      );
      expect(screen.queryByText("Select all")).not.toBeInTheDocument();
    });
  });

  describe("keyboard navigation", () => {
    it("ArrowDown/ArrowUp move onSelect through the flattened groups order, no-op at boundaries", () => {
      const onSelect = jest.fn();
      // flattened order: failed, errored, passed, queued, running, pending
      // f1, e1, p1, q1, r1, pd1
      render(
        <TestRunOutputsPanel results={allResults} selectedId="f1" onSelect={onSelect} />,
      );
      fireEvent.keyDown(window, { key: "ArrowUp" });
      expect(onSelect).not.toHaveBeenCalled();

      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onSelect).toHaveBeenCalledWith("e1");
    });

    it("ArrowDown is a no-op at the last item", () => {
      const onSelect = jest.fn();
      render(
        <TestRunOutputsPanel results={allResults} selectedId="pd1" onSelect={onSelect} />,
      );
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("ArrowUp moves to the previous item", () => {
      const onSelect = jest.fn();
      render(
        <TestRunOutputsPanel results={allResults} selectedId="p1" onSelect={onSelect} />,
      );
      fireEvent.keyDown(window, { key: "ArrowUp" });
      expect(onSelect).toHaveBeenCalledWith("e1");
    });

    it("no-ops when nothing is selected (selectedId null)", () => {
      const onSelect = jest.fn();
      render(
        <TestRunOutputsPanel results={allResults} selectedId={null} onSelect={onSelect} />,
      );
      fireEvent.keyDown(window, { key: "ArrowDown" });
      expect(onSelect).not.toHaveBeenCalled();
    });
  });

  describe("onNavChange", () => {
    it("fires with currentIndex/total reflecting flattened order, and goPrev/goNext trigger onSelect correctly", () => {
      const onSelect = jest.fn();
      const onNavChange = jest.fn();
      render(
        <TestRunOutputsPanel
          results={allResults}
          selectedId="e1"
          onSelect={onSelect}
          onNavChange={onNavChange}
        />,
      );
      expect(onNavChange).toHaveBeenCalled();
      const lastCall = onNavChange.mock.calls[onNavChange.mock.calls.length - 1][0];
      expect(lastCall.currentIndex).toBe(1);
      expect(lastCall.total).toBe(6);

      lastCall.goNext();
      expect(onSelect).toHaveBeenCalledWith("p1");

      lastCall.goPrev();
      expect(onSelect).toHaveBeenCalledWith("f1");
    });

    it("does not call onNavChange when not provided (no crash)", () => {
      expect(() =>
        render(
          <TestRunOutputsPanel results={allResults} selectedId="p1" onSelect={jest.fn()} />,
        ),
      ).not.toThrow();
    });
  });
});
