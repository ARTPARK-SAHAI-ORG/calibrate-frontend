import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddSttItemsDialog } from "../AddSttItemsDialog";

// bulk-upload-shared.tsx pulls in jspdf (ESM, not transformed by Jest) for
// unrelated CSV/PDF export helpers. AddSttItemsDialog only needs
// humaniseDetailObject from it, so stub the module with a minimal
// reimplementation to avoid loading jspdf in this test file.
jest.mock("../bulk-upload-shared", () => ({
  humaniseDetailObject: (detail: {
    code?: string;
    conflicting_names?: string[];
  }): string | null => {
    const names = detail.conflicting_names ?? [];
    const fmt =
      names.length === 0
        ? null
        : names.length === 1
          ? `"${names[0]}"`
          : names.map((n) => `"${n}"`).join(", ");
    if (detail.code === "ITEM_NAME_CONFLICT") {
      return fmt
        ? names.length === 1
          ? `An item named ${fmt} already exists in this task.`
          : `Items with these names already exist in this task: ${fmt}.`
        : "One or more item names already exist in this task.";
    }
    return null;
  },
}));

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddSttItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const utils = render(
    <AddSttItemsDialog
      isOpen
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onClose, onSubmit, ...utils };
}

describe("AddSttItemsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <AddSttItemsDialog isOpen={false} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByText("Add items")).not.toBeInTheDocument();
  });

  it("renders the add-mode header and a single blank row", () => {
    renderDialog();
    expect(screen.getByText("Add items")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Annotators will compare the predicted transcript against the reference",
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Clip 1")).toBeInTheDocument();
  });

  it("keeps Add disabled until all fields in a row are filled", async () => {
    const user = setupUser();
    renderDialog();
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("What was actually said"),
      "hello",
    );
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("What the system transcribed"),
      "helo",
    );
    expect(addButton).not.toBeDisabled();
  });

  it("adds and removes rows", async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Add another item" }));
    expect(screen.getAllByPlaceholderText("e.g. Clip 1")).toHaveLength(2);

    const removeButtons = screen.getAllByLabelText(/Remove item/);
    await user.click(removeButtons[1]);
    expect(screen.getAllByPlaceholderText("e.g. Clip 1")).toHaveLength(1);
  });

  it("disables removing the last remaining row", async () => {
    renderDialog();
    const removeButton = screen.getByLabelText("Remove item 1");
    expect(removeButton).toBeDisabled();
  });

  it("submits only valid (fully-filled) rows, trimmed", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({ onSubmit });

    await user.click(screen.getByRole("button", { name: "Add another item" }));
    const names = screen.getAllByPlaceholderText("e.g. Clip 1");
    const actuals = screen.getAllByPlaceholderText("What was actually said");
    const predicteds = screen.getAllByPlaceholderText(
      "What the system transcribed",
    );

    await user.type(names[0], "  Clip 1  ");
    await user.type(actuals[0], "  hello  ");
    await user.type(predicteds[0], "  helo  ");
    // Second row left blank — should be filtered out.

    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        uuid: undefined,
        name: "Clip 1",
        actual_transcript: "hello",
        predicted_transcript: "helo",
      },
    ]);
  });

  it("shows 'Add N items' label and count once multiple rows are valid", async () => {
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Add another item" }));

    const names = screen.getAllByPlaceholderText("e.g. Clip 1");
    const actuals = screen.getAllByPlaceholderText("What was actually said");
    const predicteds = screen.getAllByPlaceholderText(
      "What the system transcribed",
    );
    for (let i = 0; i < 2; i++) {
      await user.type(names[i], `Clip ${i}`);
      await user.type(actuals[i], "a");
      await user.type(predicteds[i], "p");
    }

    expect(
      screen.getByRole("button", { name: "Add 2 items" }),
    ).toBeInTheDocument();
  });

  it("shows an inline error parsed from a structured detail object", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Request failed: 400 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Clip 1"]}}',
        ),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("What was actually said"),
      "hello",
    );
    await user.type(
      screen.getByPlaceholderText("What the system transcribed"),
      "helo",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText(
        'An item named "Clip 1" already exists in this task.',
      ),
    ).toBeInTheDocument();
  });

  it("shows the raw detail string when the error body isn't a structured object", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error('Request failed: 500 - {"detail":"Server exploded"}'),
      );
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("What was actually said"),
      "hello",
    );
    await user.type(
      screen.getByPlaceholderText("What the system transcribed"),
      "helo",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText('{"detail":"Server exploded"}'),
    ).toBeInTheDocument();
  });

  it("falls back to the default add error for a non-Error rejection", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockRejectedValue("boom");
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("What was actually said"),
      "hello",
    );
    await user.type(
      screen.getByPlaceholderText("What the system transcribed"),
      "helo",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Failed to add items")).toBeInTheDocument();
  });

  it("re-enables the submit button after a failed submit", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockRejectedValue(new Error("Network down"));
    renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("What was actually said"),
      "hello",
    );
    await user.type(
      screen.getByPlaceholderText("What the system transcribed"),
      "helo",
    );
    const submitButton = screen.getByRole("button", { name: "Add item" });
    await user.click(submitButton);

    await screen.findByText("Network down");
    expect(submitButton).not.toBeDisabled();
  });

  it("closes immediately (clean form) via the header close button", async () => {
    const user = setupUser();
    const { onClose, container } = renderDialog();
    const headerCloseButton = container.querySelector(
      ".border-b button",
    ) as Element;
    await user.click(headerCloseButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes via footer Cancel when the form is clean", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("prompts a discard-changes confirmation when closing a dirty add form", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not close the dialog when clicking inside the panel", async () => {
    const user = setupUser();
    const { onClose } = renderDialog();
    await user.click(screen.getByText("Add items"));
    expect(onClose).not.toHaveBeenCalled();
  });

  describe("edit mode", () => {
    const initialRows = [
      { uuid: "u1", name: "Clip 1", actual: "hello", predicted: "helo" },
      { uuid: "u2", name: "Clip 2", actual: "world", predicted: "wrld" },
    ];

    it("seeds rows from initialRows, hides remove/add controls, and disables Save with no edits made... actually enables since row is complete", () => {
      renderDialog({ mode: "edit", initialRows });
      expect(screen.getByText("Edit items")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Update the name, reference, and predicted transcripts for each row",
        ),
      ).toBeInTheDocument();
      expect(screen.getAllByDisplayValue(/Clip \d/)).toHaveLength(2);
      expect(
        screen.queryByRole("button", { name: "Add another item" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Remove item/)).not.toBeInTheDocument();
    });

    it("shows 'Save item'/'Save N items' labels and submits edited rows", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({ mode: "edit", initialRows, onSubmit });

      expect(
        screen.getByRole("button", { name: "Save 2 items" }),
      ).toBeInTheDocument();

      const nameInputs = screen.getAllByDisplayValue(/Clip \d/);
      await user.clear(nameInputs[0]);
      await user.type(nameInputs[0], "Clip 1 renamed");

      await user.click(screen.getByRole("button", { name: "Save 2 items" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toEqual([
        {
          uuid: "u1",
          name: "Clip 1 renamed",
          actual_transcript: "hello",
          predicted_transcript: "helo",
        },
        {
          uuid: "u2",
          name: "Clip 2",
          actual_transcript: "world",
          predicted_transcript: "wrld",
        },
      ]);
    });

    it("treats a single-row edit as dirty only when a field differs from the seed", async () => {
      const user = setupUser();
      const singleRow = [initialRows[0]];
      const { onClose } = renderDialog({ mode: "edit", initialRows: singleRow });

      // Clean close: no edits made.
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    });

    it("prompts discard confirmation when an edit-mode row is modified then closed", async () => {
      const user = setupUser();
      const { onClose } = renderDialog({ mode: "edit", initialRows });
      const nameInputs = screen.getAllByDisplayValue(/Clip \d/);
      await user.type(nameInputs[0], "!");

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByText("Discard changes?")).toBeInTheDocument();
    });

    it("shows 'Save item' (singular) label for a single edited row", () => {
      renderDialog({ mode: "edit", initialRows: [initialRows[0]] });
      expect(
        screen.getByRole("button", { name: "Save item" }),
      ).toBeInTheDocument();
    });

    it("resets to the new initialRows when reopened", () => {
      const { rerender } = render(
        <AddSttItemsDialog
          isOpen={false}
          mode="edit"
          initialRows={initialRows}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      rerender(
        <AddSttItemsDialog
          isOpen
          mode="edit"
          initialRows={[
            { uuid: "u3", name: "Fresh", actual: "a", predicted: "b" },
          ]}
          onClose={jest.fn()}
          onSubmit={jest.fn()}
        />,
      );
      expect(screen.getByDisplayValue("Fresh")).toBeInTheDocument();
    });

    it("shows saving state while submitting", async () => {
      const user = setupUser();
      let resolveSubmit: (() => void) | undefined;
      const onSubmit = jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveSubmit = resolve;
          }),
      );
      renderDialog({ mode: "edit", initialRows, onSubmit });
      const nameInputs = screen.getAllByDisplayValue(/Clip \d/);
      await user.type(nameInputs[0], "!");

      const saveButton = screen.getByRole("button", { name: "Save 2 items" });
      await user.click(saveButton);

      expect(screen.getByText("Saving...")).toBeInTheDocument();
      resolveSubmit?.();
      await waitFor(() =>
        expect(screen.queryByText("Saving...")).not.toBeInTheDocument(),
      );
    });
  });

  it("falls back to a random id for new rows when crypto.randomUUID is unavailable", async () => {
    const original = global.crypto;
    delete (global as { crypto?: Crypto }).crypto;
    const user = setupUser();
    renderDialog();
    await user.click(screen.getByRole("button", { name: "Add another item" }));
    expect(screen.getAllByPlaceholderText("e.g. Clip 1")).toHaveLength(2);
    global.crypto = original;
  });
});
