import React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { TTSDatasetEditor, TTSDatasetEditorHandle } from "../TTSDatasetEditor";
import type { DatasetItem } from "../../../lib/datasets";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
import { toast } from "sonner";

function makeItem(overrides: Partial<DatasetItem> = {}): DatasetItem {
  return {
    uuid: "item-1",
    text: "Hello there",
    order_index: 0,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

// Wrapper exposing the imperative handle for assertions.
function Harness(props: React.ComponentProps<typeof TTSDatasetEditor>) {
  const ref = React.useRef<TTSDatasetEditorHandle>(null);
  (Harness as any).ref = ref;
  return <TTSDatasetEditor {...props} ref={ref} />;
}

function getHandle(): TTSDatasetEditorHandle {
  return (Harness as any).ref.current;
}

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).URL.createObjectURL = jest.fn(() => "blob:mock");
  (global as any).URL.revokeObjectURL = jest.fn();
});

describe("TTSDatasetEditor", () => {
  it("renders a single blank row and no dataset-name field by default", () => {
    render(<Harness />);
    expect(screen.queryByText("Dataset name")).not.toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Enter text to synthesize"),
    ).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows the dataset name field and forwards changes when enabled", async () => {
    const user = setupUser();
    const onDatasetNameChange = jest.fn();
    render(
      <Harness
        showDatasetName
        datasetName=""
        onDatasetNameChange={onDatasetNameChange}
      />,
    );
    const input = screen.getByPlaceholderText("e.g. English TTS test set");
    await user.type(input, "x");
    expect(onDatasetNameChange).toHaveBeenCalledWith("x");
  });

  it("applies invalid styling to the dataset name input", () => {
    render(<Harness showDatasetName datasetNameInvalid />);
    const input = screen.getByPlaceholderText("e.g. English TTS test set");
    expect(input.className).toContain("border-red-500");
  });

  it("types into a new row and reports pending changes", async () => {
    const user = setupUser();
    const onHasPendingChangesChange = jest.fn();
    render(<Harness onHasPendingChangesChange={onHasPendingChangesChange} />);

    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Hello world",
    );

    await waitFor(() =>
      expect(onHasPendingChangesChange).toHaveBeenLastCalledWith(true),
    );
    expect(getHandle().getNewRows()).toEqual([{ text: "Hello world" }]);
  });

  it("adds a new row once the current row has text", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));

    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(2);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("blocks adding a row when an existing row is blank and marks it invalid", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Add another row"));

    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(1);
    const input = screen.getByPlaceholderText("Enter text to synthesize");
    expect(input.className).toContain("border-red-500");
  });

  it("clears the invalid marker once text is typed into the offending row", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Add another row"));
    const input = screen.getByPlaceholderText("Enter text to synthesize");
    expect(input.className).toContain("border-red-500");

    await user.type(input, "now valid");
    expect(input.className).not.toContain("border-red-500");
  });

  it("shows a limit toast and refuses to add rows past maxRowsPerEval", async () => {
    const user = setupUser();
    render(<Harness maxRowsPerEval={1} />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));

    expect(toast.error).toHaveBeenCalled();
    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(1);
  });

  it("does not show a delete button for the only new row when there are no saved items", () => {
    render(<Harness />);
    expect(screen.queryByTitle("Delete item")).not.toBeInTheDocument();
    // Only "Add another row" and "Download sample" — no row-delete button.
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("deletes an empty extra new row immediately without a confirmation dialog", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));
    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(2);

    // Second row is blank; its delete button removes it directly.
    const deleteButtons = screen.getAllByRole("button").filter((b) =>
      b.querySelector("svg"),
    );
    const rowDeleteButtons = deleteButtons.filter(
      (b) => b.textContent === "",
    );
    await user.click(rowDeleteButtons[rowDeleteButtons.length - 1]);

    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(1);
    expect(screen.queryByText("Remove this text row?")).not.toBeInTheDocument();
  });

  it("confirms before deleting a new row that has text", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));
    await user.type(
      screen.getAllByPlaceholderText("Enter text to synthesize")[1],
      "Row two",
    );

    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg") && b.textContent === "");
    await user.click(deleteButtons[deleteButtons.length - 1]);

    expect(screen.getByText("Remove this text row?")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        screen.getAllByPlaceholderText("Enter text to synthesize"),
      ).toHaveLength(1),
    );
  });

  it("closes the delete-row dialog on cancel without removing the row", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));
    await user.type(
      screen.getAllByPlaceholderText("Enter text to synthesize")[1],
      "Row two",
    );
    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.querySelector("svg") && b.textContent === "");
    await user.click(deleteButtons[deleteButtons.length - 1]);

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Remove this text row?")).not.toBeInTheDocument();
    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(2);
  });

  it("renders saved items and edits are tracked as dirty updates", async () => {
    const user = setupUser();
    const savedItems = [makeItem({ uuid: "a", text: "Original", order_index: 0 })];
    const onHasPendingChangesChange = jest.fn();
    render(
      <Harness
        savedItems={savedItems}
        onDeleteSavedItem={jest.fn()}
        onHasPendingChangesChange={onHasPendingChangesChange}
      />,
    );

    const savedInput = screen.getByDisplayValue("Original");
    await user.clear(savedInput);
    await user.type(savedInput, "Edited");

    await waitFor(() =>
      expect(getHandle().getDirtyUpdates()).toEqual([
        { uuid: "a", text: "Edited" },
      ]),
    );
    expect(onHasPendingChangesChange).toHaveBeenLastCalledWith(true);

    act(() => getHandle().clearDirtyUpdates());
    await waitFor(() => expect(getHandle().getDirtyUpdates()).toEqual([]));
  });

  it("blocks deleting a saved item when it is the last one, with a toast", async () => {
    const user = setupUser();
    const savedItems = [makeItem({ uuid: "a" })];
    render(
      <Harness savedItems={savedItems} onDeleteSavedItem={jest.fn()} />,
    );

    await user.click(screen.getByTitle("Delete item"));
    expect(toast.error).toHaveBeenCalledWith(
      "Dataset must have at least 2 items.",
    );
    expect(screen.queryByText("Remove this item from the dataset?")).not.toBeInTheDocument();
  });

  it("deletes a saved item via confirmation dialog when onDeleteSavedItem resolves", async () => {
    const user = setupUser();
    const onDeleteSavedItem = jest.fn().mockResolvedValue(undefined);
    const savedItems = [makeItem({ uuid: "a" }), makeItem({ uuid: "b", text: "Second" })];
    render(
      <Harness savedItems={savedItems} onDeleteSavedItem={onDeleteSavedItem} />,
    );

    const deleteButtons = screen.getAllByTitle("Delete item");
    await user.click(deleteButtons[0]);
    expect(screen.getByText("Remove this item from the dataset?")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(onDeleteSavedItem).toHaveBeenCalledWith("a"));
    await waitFor(() =>
      expect(
        screen.queryByText("Remove this item from the dataset?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("closes the saved-item delete dialog even when onDeleteSavedItem rejects", async () => {
    const user = setupUser();
    const onDeleteSavedItem = jest.fn().mockRejectedValue(new Error("boom"));
    const savedItems = [makeItem({ uuid: "a" }), makeItem({ uuid: "b" })];
    render(
      <Harness savedItems={savedItems} onDeleteSavedItem={onDeleteSavedItem} />,
    );

    const deleteButtons = screen.getAllByTitle("Delete item");
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(
        screen.queryByText("Remove this item from the dataset?"),
      ).not.toBeInTheDocument(),
    );
  });

  it("cancels the saved-item delete dialog without calling onDeleteSavedItem", async () => {
    const user = setupUser();
    const onDeleteSavedItem = jest.fn();
    const savedItems = [makeItem({ uuid: "a" }), makeItem({ uuid: "b" })];
    render(
      <Harness savedItems={savedItems} onDeleteSavedItem={onDeleteSavedItem} />,
    );
    const deleteButtons = screen.getAllByTitle("Delete item");
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDeleteSavedItem).not.toHaveBeenCalled();
    expect(screen.queryByText("Remove this item from the dataset?")).not.toBeInTheDocument();
  });

  it("does not render a delete button for saved items when onDeleteSavedItem is absent", () => {
    const savedItems = [makeItem({ uuid: "a" })];
    render(<Harness savedItems={savedItems} />);
    expect(screen.queryByTitle("Delete item")).not.toBeInTheDocument();
  });

  it("clearNewRows resets to a single blank row", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.type(
      screen.getByPlaceholderText("Enter text to synthesize"),
      "Row one",
    );
    await user.click(screen.getByText("Add another row"));
    expect(
      screen.getAllByPlaceholderText("Enter text to synthesize"),
    ).toHaveLength(2);

    act(() => getHandle().clearNewRows());

    await waitFor(() =>
      expect(
        screen.getAllByPlaceholderText("Enter text to synthesize"),
      ).toHaveLength(1),
    );
    expect(
      (screen.getByPlaceholderText(
        "Enter text to synthesize",
      ) as HTMLInputElement).value,
    ).toBe("");
  });

  describe("CSV upload", () => {
    function csvFile(content: string, name = "input.csv") {
      return new File([content], name, { type: "text/csv" });
    }

    it("downloads a sample CSV via an anchor click", () => {
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      render(<Harness />);
      const btn = screen.getByText("Download sample");
      btn.click();
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
      clickSpy.mockRestore();
    });

    it("rejects a CSV with no 'text' header", async () => {
      const { container } = render(<Harness />);
      const input = container.querySelector(
        "#tts-csv-upload",
      ) as HTMLInputElement;
      const file = csvFile("name\nfoo\nbar");
      await setupUser().upload(input, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "CSV must have a 'text' column header",
        ),
      );
    });

    it("parses a valid CSV (including quoted commas) into new rows", async () => {
      const { container } = render(<Harness />);
      const input = container.querySelector(
        "#tts-csv-upload",
      ) as HTMLInputElement;
      const file = csvFile(
        'text\n"Hello, world"\nSecond line',
      );
      await setupUser().upload(input, file);

      await waitFor(() =>
        expect(
          screen.getAllByPlaceholderText("Enter text to synthesize"),
        ).toHaveLength(2),
      );
      expect(screen.getByDisplayValue("Hello, world")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Second line")).toBeInTheDocument();
    });

    it("rejects a CSV that produces more rows than maxRowsPerEval", async () => {
      const { container } = render(<Harness maxRowsPerEval={1} />);
      const input = container.querySelector(
        "#tts-csv-upload",
      ) as HTMLInputElement;
      const file = csvFile("text\nOne\nTwo");
      await setupUser().upload(input, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalled(),
      );
      expect(
        screen.getAllByPlaceholderText("Enter text to synthesize"),
      ).toHaveLength(1);
    });

    it("rejects a CSV row whose text exceeds the max length", async () => {
      const { container } = render(<Harness />);
      const input = container.querySelector(
        "#tts-csv-upload",
      ) as HTMLInputElement;
      const longText = "a".repeat(201);
      const file = csvFile(`text\n${longText}`);
      await setupUser().upload(input, file);

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
      expect(
        screen.getAllByPlaceholderText("Enter text to synthesize"),
      ).toHaveLength(1);
    });

    it("no-ops when no file is selected", async () => {
      const { container } = render(<Harness />);
      const input = container.querySelector(
        "#tts-csv-upload",
      ) as HTMLInputElement;
      // Fire a change event with no files attached.
      Object.defineProperty(input, "files", { value: [], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));

      expect(
        screen.getAllByPlaceholderText("Enter text to synthesize"),
      ).toHaveLength(1);
    });
  });
});
