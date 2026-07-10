/**
 * Example: interaction test for an async form dialog.
 * This is the most representative pattern in the app — a form whose submit
 * handler calls an async callback (usually wrapping `api.post`). Shows how to:
 *   - assert the submit button is gated on input
 *   - fill an input and submit
 *   - assert the async callback got the trimmed value
 *   - assert an error surfaces when the callback rejects
 *
 * In a real page the `onCreate` prop calls the backend via `src/lib/api.ts`.
 * Here we pass a jest.fn() so no network happens — that boundary is exactly
 * what makes these tests fast and deterministic.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CreateWorkspaceDialog } from "../CreateWorkspaceDialog";

describe("CreateWorkspaceDialog", () => {
  it("keeps submit disabled until a name is entered", async () => {
    const user = setupUser();
    render(
      <CreateWorkspaceDialog
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    const submit = screen.getByRole("button", { name: "Create workspace" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Acme Health"), "Acme");
    expect(submit).toBeEnabled();
  });

  it("submits the trimmed name and closes on success", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(
      <CreateWorkspaceDialog isOpen onClose={onClose} onCreate={onCreate} />,
    );

    await user.type(
      screen.getByPlaceholderText("e.g. Acme Health"),
      "  Acme Health  ",
    );
    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Acme Health"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an error message and stays open when creation fails", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockRejectedValue(new Error("Name taken"));
    const onClose = jest.fn();
    render(
      <CreateWorkspaceDialog isOpen onClose={onClose} onCreate={onCreate} />,
    );

    await user.type(screen.getByPlaceholderText("e.g. Acme Health"), "Acme");
    await user.click(screen.getByRole("button", { name: "Create workspace" }));

    expect(await screen.findByText("Name taken")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
