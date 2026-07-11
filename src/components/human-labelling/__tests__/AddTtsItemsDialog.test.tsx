import { render, screen, setupUser, waitFor } from "@/test-utils";
import { AddTtsItemsDialog } from "../AddTtsItemsDialog";

// bulk-upload-shared.tsx pulls in jspdf (ESM, not transformed by Jest) for
// unrelated CSV/PDF export helpers. AddTtsItemsDialog only needs
// humaniseDetailObject from it, so stub the module with a minimal
// reimplementation to avoid loading jspdf in this test file.
jest.mock("../bulk-upload-shared", () => ({
  humaniseDetailObject: (detail: {
    code?: string;
    conflicting_names?: string[];
  }): string | null => {
    const names = detail.conflicting_names ?? [];
    if (detail.code === "ITEM_NAME_CONFLICT") {
      return names.length === 1
        ? `An item named "${names[0]}" already exists in this task.`
        : "One or more item names already exist in this task.";
    }
    return null;
  },
}));

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddTtsItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const utils = render(
    <AddTtsItemsDialog isOpen onClose={onClose} onSubmit={onSubmit} {...props} />,
  );
  return { onClose, onSubmit, ...utils };
}

describe("AddTtsItemsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <AddTtsItemsDialog isOpen={false} onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    expect(screen.queryByText("Add items")).not.toBeInTheDocument();
  });

  it("renders the add-mode header and a single blank row", () => {
    renderDialog();
    expect(screen.getByText("Add items")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Annotators will listen to the generated audio and judge its quality",
      ),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. Clip 1")).toBeInTheDocument();
  });

  it("keeps Add disabled until name, text and audio are all filled", async () => {
    const user = setupUser();
    renderDialog();
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("The text that was spoken"),
      "hello",
    );
    expect(addButton).toBeDisabled();

    await user.type(
      screen.getByPlaceholderText("https://.../audio.wav"),
      "https://x/a.wav",
    );
    expect(addButton).not.toBeDisabled();
  });

  it("shows an inline audio preview once an audio URL is entered", async () => {
    const user = setupUser();
    renderDialog();
    expect(screen.queryByLabelText("Play")).not.toBeInTheDocument();
    await user.type(
      screen.getByPlaceholderText("https://.../audio.wav"),
      "https://x/a.wav",
    );
    expect(screen.getByLabelText("Play")).toBeInTheDocument();
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

  it("submits only valid rows, mapping fields to text/audio_path (trimmed)", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({ onSubmit });

    await user.click(screen.getByRole("button", { name: "Add another item" }));
    const names = screen.getAllByPlaceholderText("e.g. Clip 1");
    const texts = screen.getAllByPlaceholderText("The text that was spoken");
    const audios = screen.getAllByPlaceholderText("https://.../audio.wav");

    await user.type(names[0], "  Clip 1  ");
    await user.type(texts[0], "  hello  ");
    await user.type(audios[0], "  https://x/a.wav  ");
    // Second row left blank — should be filtered out.

    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith([
      {
        uuid: undefined,
        name: "Clip 1",
        text: "hello",
        audio_path: "https://x/a.wav",
      },
    ]);
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
      screen.getByPlaceholderText("The text that was spoken"),
      "hello",
    );
    await user.type(
      screen.getByPlaceholderText("https://.../audio.wav"),
      "https://x/a.wav",
    );
    await user.click(screen.getByRole("button", { name: "Add item" }));

    expect(
      await screen.findByText(
        'An item named "Clip 1" already exists in this task.',
      ),
    ).toBeInTheDocument();
  });

  describe("edit mode", () => {
    const initialRows = [
      {
        uuid: "u1",
        name: "Clip 1",
        text: "hello",
        audio: "https://x/a.wav",
      },
      {
        uuid: "u2",
        name: "Clip 2",
        text: "world",
        audio: "https://x/b.wav",
      },
    ];

    it("seeds rows from initialRows and hides add/remove controls", () => {
      renderDialog({ mode: "edit", initialRows });
      expect(screen.getByText("Edit items")).toBeInTheDocument();
      expect(screen.getAllByDisplayValue(/Clip \d/)).toHaveLength(2);
      expect(
        screen.queryByRole("button", { name: "Add another item" }),
      ).not.toBeInTheDocument();
      expect(screen.queryByLabelText(/Remove item/)).not.toBeInTheDocument();
    });

    it("submits edited rows preserving uuids", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({ mode: "edit", initialRows, onSubmit });

      const nameInputs = screen.getAllByDisplayValue(/Clip \d/);
      await user.clear(nameInputs[0]);
      await user.type(nameInputs[0], "Clip 1 renamed");

      await user.click(screen.getByRole("button", { name: "Save 2 items" }));

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0]).toEqual([
        {
          uuid: "u1",
          name: "Clip 1 renamed",
          text: "hello",
          audio_path: "https://x/a.wav",
        },
        {
          uuid: "u2",
          name: "Clip 2",
          text: "world",
          audio_path: "https://x/b.wav",
        },
      ]);
    });
  });
});
