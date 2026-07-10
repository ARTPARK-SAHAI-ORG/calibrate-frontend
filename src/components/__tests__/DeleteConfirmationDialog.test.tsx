/**
 * Example: interaction test for a confirm/cancel dialog.
 * Shows conditional rendering (closed vs open), the confirm and cancel
 * actions, and that both buttons are disabled while an async delete runs.
 */
import { render, screen, setupUser } from "@/test-utils";
import { DeleteConfirmationDialog } from "../DeleteConfirmationDialog";

function renderDialog(props: Partial<React.ComponentProps<typeof DeleteConfirmationDialog>> = {}) {
  const onClose = jest.fn();
  const onConfirm = jest.fn();
  render(
    <DeleteConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      message="Delete this agent?"
      {...props}
    />,
  );
  return { onClose, onConfirm };
}

describe("DeleteConfirmationDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <DeleteConfirmationDialog
        isOpen={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        message="Delete this agent?"
      />,
    );
    expect(screen.queryByText("Delete this agent?")).not.toBeInTheDocument();
  });

  it("calls onConfirm when the confirm button is clicked", async () => {
    const user = setupUser();
    const { onConfirm } = renderDialog({ confirmText: "Remove" });

    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the cancel button is clicked", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("disables actions and shows progress text while deleting", async () => {
    const user = setupUser();
    const { onClose, onConfirm } = renderDialog({
      isDeleting: true,
      confirmText: "Remove",
    });

    // Button label switches to the "...ing" form.
    expect(screen.getByRole("button", { name: /Removing/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
