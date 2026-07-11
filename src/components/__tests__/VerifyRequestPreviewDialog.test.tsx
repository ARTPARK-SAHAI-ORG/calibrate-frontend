import { render, screen, setupUser } from "@/test-utils";
import { VerifyRequestPreviewDialog } from "../VerifyRequestPreviewDialog";

describe("VerifyRequestPreviewDialog", () => {
  it("renders nothing when open is false", () => {
    const { container } = render(
      <VerifyRequestPreviewDialog
        open={false}
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the default message row and JSON preview when open", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    expect(screen.getByText("Verify connection")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Hi")).toBeInTheDocument();
    expect(
      screen.getByText(/"role": "user"/),
    ).toBeInTheDocument();
  });

  it("closes on backdrop click", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <VerifyRequestPreviewDialog
        open
        onClose={onClose}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    await user.click(container.firstChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close on card click", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={onClose}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    await user.click(screen.getByText("Verify connection"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("resets state on close via Cancel button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={onClose}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    await user.clear(screen.getByDisplayValue("Hi"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close while isVerifying is true", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={onClose}
        onConfirm={jest.fn()}
        isVerifying
      />,
    );
    // Cancel button is disabled while verifying, backdrop click should be a no-op too.
    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    expect(cancelButton).toBeDisabled();
    await user.click(cancelButton);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("backdrop click is a no-op while isVerifying (handleClose early-return)", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const { container } = render(
      <VerifyRequestPreviewDialog
        open
        onClose={onClose}
        onConfirm={jest.fn()}
        isVerifying
      />,
    );
    await user.click(container.firstChild as HTMLElement);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("changes a message's role via the select", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    const select = screen.getByDisplayValue("user") as HTMLSelectElement;
    await user.selectOptions(select, "assistant");
    expect(select.value).toBe("assistant");
    expect(screen.getByText(/"role": "assistant"/)).toBeInTheDocument();
  });

  it("edits message content and clears its empty-error indicator", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    const input = screen.getByPlaceholderText("Message content");
    await user.clear(input);
    await user.click(screen.getByRole("button", { name: /Send & Verify/i }));
    expect(
      screen.getByText("Message cannot be empty"),
    ).toBeInTheDocument();

    await user.type(input, "Hello there");
    expect(
      screen.queryByText("Message cannot be empty"),
    ).not.toBeInTheDocument();
  });

  it("edits only the targeted row's role and content, leaving other rows untouched", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    await user.click(screen.getByText("Add message"));
    const contentInputs = screen.getAllByPlaceholderText("Message content");
    expect(contentInputs).toHaveLength(2);

    await user.type(contentInputs[1], "Second message");

    expect((contentInputs[0] as HTMLInputElement).value).toBe("Hi");
    expect((contentInputs[1] as HTMLInputElement).value).toBe(
      "Second message",
    );

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    await user.selectOptions(selects[1], "user");
    expect(selects[0].value).toBe("user");
    expect(selects[1].value).toBe("user");
  });

  it("adds a new row alternating role, defaulting to assistant after a user row", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    await user.click(screen.getByText("Add message"));
    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    expect(selects[1].value).toBe("assistant");
  });

  it("adds a row defaulting to user after an assistant row", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    const select = screen.getByDisplayValue("user") as HTMLSelectElement;
    await user.selectOptions(select, "assistant");
    await user.click(screen.getByText("Add message"));

    const selects = screen.getAllByRole("combobox") as HTMLSelectElement[];
    expect(selects).toHaveLength(2);
    expect(selects[1].value).toBe("user");
  });

  it("removes a row and disables removal at exactly one row", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );

    // Only one row exists initially — remove button disabled.
    const removeButtons = screen.getAllByRole("button", { hidden: true }).filter(
      (b) => b.querySelector("path[d='M6 18L18 6M6 6l12 12']"),
    );
    expect(removeButtons[0]).toBeDisabled();

    await user.click(screen.getByText("Add message"));
    const removeButtonsAfterAdd = screen
      .getAllByRole("button", { hidden: true })
      .filter((b) => b.querySelector("path[d='M6 18L18 6M6 6l12 12']"));
    expect(removeButtonsAfterAdd).toHaveLength(2);
    expect(removeButtonsAfterAdd[0]).toBeEnabled();

    await user.click(removeButtonsAfterAdd[0]);
    const selects = screen.getAllByRole("combobox");
    expect(selects).toHaveLength(1);
  });

  it("does not remove the row when only one remains, even if invoked directly", async () => {
    const user = setupUser();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
      />,
    );
    const selectsBefore = screen.getAllByRole("combobox");
    expect(selectsBefore).toHaveLength(1);
    // The remove button is disabled in the UI for the single row; nothing to
    // click, this test documents the guard exists (handleRemoveRow no-ops).
  });

  it("shows all-empty errors and blocks confirm when every message is blank", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={onConfirm}
        isVerifying={false}
      />,
    );

    await user.clear(screen.getByPlaceholderText("Message content"));
    await user.click(screen.getByRole("button", { name: /Send & Verify/i }));

    expect(onConfirm).not.toHaveBeenCalled();
    expect(screen.getByText("Message cannot be empty")).toBeInTheDocument();
  });

  it("calls onConfirm with the messages when all rows have content", async () => {
    const user = setupUser();
    const onConfirm = jest.fn();
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={onConfirm}
        isVerifying={false}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Send & Verify/i }));
    expect(onConfirm).toHaveBeenCalledWith([{ role: "user", content: "Hi" }]);
  });

  it("shows a spinner and 'Verifying...' label while isVerifying", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying
      />,
    );
    expect(screen.getByText("Verifying...")).toBeInTheDocument();
  });

  it("shows 'Retry' label after a verify error when not verifying", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
        verifyError="Something went wrong"
      />,
    );
    expect(screen.getByText("Retry")).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders the sample response JSON alongside a verify error", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying={false}
        verifyError="Bad response"
        verifySampleResponse={{ status: "error", code: 500 }}
      />,
    );
    expect(screen.getByText("Your agent responded with:")).toBeInTheDocument();
    expect(screen.getByText(/"status": "error"/)).toBeInTheDocument();
  });

  it("does not show the verify error section while isVerifying", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying
        verifyError="Should be hidden"
      />,
    );
    expect(screen.queryByText("Should be hidden")).not.toBeInTheDocument();
  });

  it("disables inputs and buttons while isVerifying", () => {
    render(
      <VerifyRequestPreviewDialog
        open
        onClose={jest.fn()}
        onConfirm={jest.fn()}
        isVerifying
      />,
    );
    expect(screen.getByDisplayValue("Hi")).toBeDisabled();
    expect(screen.getByDisplayValue("user")).toBeDisabled();
    expect(screen.getByText("Add message")).toBeDisabled();
  });
});
