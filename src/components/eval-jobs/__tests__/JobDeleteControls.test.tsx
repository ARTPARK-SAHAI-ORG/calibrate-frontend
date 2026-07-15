/**
 * Render/interaction tests for the shared STT/TTS delete UI components.
 * Covers the bulk toolbar's count + button visibility and the confirmation
 * dialog's single-vs-bulk copy, error surfacing, and delete callbacks.
 */
import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  JobBulkDeleteBar,
  JobRowDeleteCell,
  JobDeleteDialog,
} from "@/components/eval-jobs/JobDeleteControls";

describe("JobBulkDeleteBar", () => {
  it("pluralises the count and hides the button with no selection", () => {
    const { rerender } = render(
      <JobBulkDeleteBar count={1} selectedCount={0} onBulkDelete={jest.fn()} />,
    );
    expect(screen.getByText("1 evaluation")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /delete selected/i }),
    ).not.toBeInTheDocument();

    rerender(
      <JobBulkDeleteBar count={4} selectedCount={0} onBulkDelete={jest.fn()} />,
    );
    expect(screen.getByText("4 evaluations")).toBeInTheDocument();
  });

  it("shows the bulk button with a count and fires the callback", async () => {
    const user = setupUser();
    const onBulkDelete = jest.fn();
    render(
      <JobBulkDeleteBar
        count={5}
        selectedCount={3}
        onBulkDelete={onBulkDelete}
      />,
    );

    const button = screen.getByRole("button", {
      name: "Delete selected (3)",
    });
    await user.click(button);
    expect(onBulkDelete).toHaveBeenCalledTimes(1);
  });
});

describe("JobRowDeleteCell", () => {
  it("calls onDelete when the trash icon is clicked", async () => {
    const user = setupUser();
    const onDelete = jest.fn();
    render(<JobRowDeleteCell onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete evaluation" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });
});

describe("JobDeleteDialog", () => {
  const baseProps = {
    isDeleting: false,
    error: null,
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };

  it("renders nothing when closed", () => {
    const { container } = render(
      <JobDeleteDialog open={false} bulkCount={0} {...baseProps} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("uses singular copy for a single delete", () => {
    render(<JobDeleteDialog open bulkCount={0} {...baseProps} />);
    expect(screen.getByText("Delete evaluation")).toBeInTheDocument();
    expect(
      screen.getByText(/delete this evaluation/i),
    ).toBeInTheDocument();
  });

  it("uses plural copy with the count for a bulk delete", () => {
    render(<JobDeleteDialog open bulkCount={3} {...baseProps} />);
    expect(screen.getByText("Delete evaluations")).toBeInTheDocument();
    expect(screen.getByText(/delete 3 evaluations/i)).toBeInTheDocument();
  });

  it("surfaces the error message and confirms", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();
    render(
      <JobDeleteDialog
        open
        bulkCount={2}
        {...baseProps}
        error="Nothing was deleted."
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByText("Nothing was deleted.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
