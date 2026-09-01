import React from "react";
import { render, screen, setupUser } from "../../../test-utils";
import {
  TestRunOutputsPanel,
  type TestRunResult,
} from "../TestRunOutputsPanel";

jest.mock("../../test-results/shared", () => ({
  StatusIcon: ({ status }: { status: string }) => (
    <span data-testid="status-icon">{status}</span>
  ),
  LabellingRowCheckbox: ({ checked }: { checked: boolean }) => (
    <span data-testid="labelling-checkbox" data-checked={checked} />
  ),
  TestDetailView: () => <div data-testid="test-detail-view" />,
  EmptyStateView: ({ message }: { message: string }) => <div>{message}</div>,
  EvaluationCriteriaPanel: () => <div data-testid="eval-criteria-panel" />,
  TestCouldNotRunNotice: () => <div data-testid="could-not-run-notice" />,
  ResizeHandle: ({ label }: { label: string }) => (
    <div data-testid="resize-handle" aria-label={label} />
  ),
  isTypingTarget: jest.fn(() => false),
  scrollRowByPage: jest.fn(),
}));

jest.mock("../../human-labelling/AddRunToLabellingTaskDialog", () => ({
  isLabellingEligibleRaw: jest.fn(() => true),
}));

const results: TestRunResult[] = [
  { id: "p1", name: "Alpha passed", status: "passed" },
  { id: "p2", name: "Beta passed", status: "passed" },
  { id: "f1", name: "Gamma failed", status: "failed" },
  {
    id: "e1",
    name: "Delta unanswered",
    status: "failed",
    unanswered: true,
    reasoning: "timed out",
  },
];

function renderPanel(props: Partial<React.ComponentProps<typeof TestRunOutputsPanel>> = {}) {
  return render(
    <TestRunOutputsPanel
      results={results}
      selectedId={null}
      onSelect={jest.fn()}
      {...props}
    />,
  );
}

/** The row element is the parent of the clickable name button. */
function rowElements(): HTMLElement[] {
  return screen
    .getAllByTestId("status-icon")
    .map((icon) => icon.closest("button")!.parentElement as HTMLElement);
}

describe("TestRunOutputsPanel", () => {
  it("groups the rows by status, with a label and count for each group", () => {
    renderPanel();
    expect(screen.getByText("Failed (1)")).toBeInTheDocument();
    expect(screen.getByText("Could not be run (1)")).toBeInTheDocument();
    expect(screen.getByText("Passed (2)")).toBeInTheDocument();
    expect(screen.getByText("Alpha passed")).toBeInTheDocument();
    expect(screen.getByText("Delta unanswered")).toBeInTheDocument();
    // A test that produced no answer is not counted as a wrong answer.
    expect(screen.queryByText("Failed (2)")).not.toBeInTheDocument();
  });

  it("lets the browser skip off-screen rows, so a run with thousands of tests still opens", () => {
    renderPanel();
    const rows = rowElements();
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.className).toContain("[content-visibility:auto]");
      expect(row.className).toContain("[contain-intrinsic-size:auto_36px]");
    }
  });

  it("calls onSelect with the id of the row that was clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    renderPanel({ onSelect });
    await user.click(screen.getByText("Gamma failed"));
    expect(onSelect).toHaveBeenCalledWith("f1");
  });

  it("narrows the list to the rows whose name matches the search box", async () => {
    const user = setupUser();
    renderPanel();
    await user.type(screen.getByPlaceholderText("Search tests"), "alpha");
    expect(screen.getByText("Alpha passed")).toBeInTheDocument();
    expect(screen.queryByText("Beta passed")).not.toBeInTheDocument();
    expect(screen.queryByText("Gamma failed")).not.toBeInTheDocument();
    expect(screen.getByText("Passed (1)")).toBeInTheDocument();
  });

  it("says nothing matched when the search box empties the list", async () => {
    const user = setupUser();
    renderPanel();
    await user.type(screen.getByPlaceholderText("Search tests"), "zzz");
    expect(screen.getByText(/No tests match/)).toBeInTheDocument();
  });
});
