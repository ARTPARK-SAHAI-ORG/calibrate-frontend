import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddAnnotatorDialog } from "../AddAnnotatorDialog";

describe("AddAnnotatorDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <AddAnnotatorDialog
        isOpen={false}
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />,
    );
    expect(screen.queryByText("Add annotator")).not.toBeInTheDocument();
  });

  it("keeps Add annotator disabled until a name is entered", async () => {
    const user = setupUser();
    render(
      <AddAnnotatorDialog
        isOpen
        onClose={jest.fn()}
        onCreate={jest.fn().mockResolvedValue(undefined)}
      />,
    );

    const submit = screen.getByRole("button", { name: "Add annotator" });
    expect(submit).toBeDisabled();

    await user.type(screen.getByPlaceholderText("Annotator name"), "Alice");
    expect(submit).toBeEnabled();
  });

  it("adds the trimmed name and closes on success", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockResolvedValue(undefined);
    const onClose = jest.fn();
    render(<AddAnnotatorDialog isOpen onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("Annotator name"), "  Alice  ");
    await user.click(screen.getByRole("button", { name: "Add annotator" }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Alice"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows the error and stays open when adding fails", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockRejectedValue(new Error("Name taken"));
    const onClose = jest.fn();
    render(<AddAnnotatorDialog isOpen onClose={onClose} onCreate={onCreate} />);

    await user.type(screen.getByPlaceholderText("Annotator name"), "Alice");
    await user.click(screen.getByRole("button", { name: "Add annotator" }));

    expect(await screen.findByText("Name taken")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("falls back to a default message when the failure is not an error", async () => {
    const user = setupUser();
    const onCreate = jest.fn().mockRejectedValue("nope");
    render(
      <AddAnnotatorDialog isOpen onClose={jest.fn()} onCreate={onCreate} />,
    );

    await user.type(screen.getByPlaceholderText("Annotator name"), "Alice");
    await user.click(screen.getByRole("button", { name: "Add annotator" }));

    expect(
      await screen.findByText("Failed to add annotator"),
    ).toBeInTheDocument();
  });

  it("closes from Cancel and the backdrop", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <AddAnnotatorDialog isOpen onClose={onClose} onCreate={jest.fn()} />,
    );

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    const backdrop = container.querySelector(".absolute.inset-0");
    await user.click(backdrop as Element);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("clears the typed name once it is closed again", async () => {
    const user = setupUser();
    const { rerender } = render(
      <AddAnnotatorDialog isOpen onClose={jest.fn()} onCreate={jest.fn()} />,
    );
    await user.type(screen.getByPlaceholderText("Annotator name"), "Alice");

    rerender(
      <AddAnnotatorDialog
        isOpen={false}
        onClose={jest.fn()}
        onCreate={jest.fn()}
      />,
    );
    rerender(
      <AddAnnotatorDialog isOpen onClose={jest.fn()} onCreate={jest.fn()} />,
    );

    expect(screen.getByPlaceholderText("Annotator name")).toHaveValue("");
  });
});
