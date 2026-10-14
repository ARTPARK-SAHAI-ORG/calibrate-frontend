import React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { AddTtsItemsDialog } from "../AddTtsItemsDialog";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// bulk-upload-shared.tsx pulls in jspdf (ESM) via humaniseDetailObject; stub it.
jest.mock("../bulk-upload-shared", () => ({
  humaniseDetailObject: () => null,
}));

// getAudioDuration (in ttsAudioUpload) creates `new Audio()`, sets `.src`, and
// relies on onloadedmetadata/onerror. LazyAudioPlayer uses addEventListener.
let mockDuration = 1;
class FakeAudio {
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  duration = 0;
  paused = true;
  currentTime = 0;
  private _src = "";
  private listeners: Record<string, Array<() => void>> = {};
  set src(v: string) {
    this._src = v;
    this.duration = mockDuration;
    setTimeout(() => {
      this.onloadedmetadata?.();
      (this.listeners.loadedmetadata || []).forEach((cb) => cb());
    }, 0);
  }
  get src() {
    return this._src;
  }
  addEventListener(event: string, cb: () => void) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(cb);
  }
  removeEventListener() {}
  play() {
    this.paused = false;
    return Promise.resolve();
  }
  pause() {
    this.paused = true;
  }
  load() {}
}

let presignedOk = true;

beforeEach(() => {
  jest.clearAllMocks();
  mockDuration = 1;
  presignedOk = true;
  (global as unknown as { Audio: unknown }).Audio = FakeAudio;
  global.URL.createObjectURL = jest.fn(() => "blob:mock");
  global.URL.revokeObjectURL = jest.fn();
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  (global as unknown as { fetch: unknown }).fetch = jest.fn((url: string) => {
    if (typeof url === "string" && url.includes("/presigned-url")) {
      return Promise.resolve({
        status: 200,
        ok: presignedOk,
        json: async () => ({
          presigned_url: "https://s3.test/put",
          s3_path: "tts/media/clip.wav",
        }),
      });
    }
    return Promise.resolve({ ok: true });
  });
});

function makeAudioFile(name = "clip.wav", sizeBytes?: number) {
  const file = new File(["x"], name, { type: "audio/wav" });
  if (sizeBytes != null) {
    Object.defineProperty(file, "size", { value: sizeBytes });
  }
  return file;
}

async function pickFile(container: HTMLElement, file: File, index = 0) {
  const input = container.querySelectorAll<HTMLInputElement>(
    'input[type="file"]',
  )[index];
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof AddTtsItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSubmit = jest.fn();
  const utils = render(
    <AddTtsItemsDialog
      isOpen
      accessToken="tok"
      onClose={onClose}
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onClose, onSubmit, ...utils };
}

describe("AddTtsItemsDialog", () => {
  it("closes without asking when the form still holds what it opened with", async () => {
    const user = setupUser();
    const { onClose } = renderDialog({
      initialRows: [{ uuid: "u1", name: "Example item 1", text: "hello", audio: "" }],
    });
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
  });

  it("asks before discarding a change to a pre-filled add form", async () => {
    const user = setupUser();
    const { onClose } = renderDialog({
      initialRows: [{ uuid: "u1", name: "Example item 1", text: "hello", audio: "" }],
    });
    await user.type(screen.getByDisplayValue("hello"), "!");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("Discard changes?")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    render(
      <AddTtsItemsDialog
        isOpen={false}
        accessToken="tok"
        onClose={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(screen.queryByText("Add items")).not.toBeInTheDocument();
  });

  it("renders stacked Name / Text / Audio fields with an upload button", () => {
    renderDialog();
    expect(screen.getByText("Add items")).toBeInTheDocument();
    expect(screen.getByText("Name")).toBeInTheDocument();
    expect(screen.getByText("Reference text")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload audio" }),
    ).toBeInTheDocument();
    // No pasted-URL field anymore.
    expect(
      screen.queryByPlaceholderText("https://.../audio.wav"),
    ).not.toBeInTheDocument();
  });

  it("disables 'Add another item' until name, text and audio are present", async () => {
    const user = setupUser();
    const { container } = renderDialog();
    const addAnother = () =>
      screen.getByRole("button", { name: "Add another item" });
    expect(addAnother()).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    expect(addAnother()).toBeDisabled();

    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );
    expect(addAnother()).not.toBeDisabled();
  });

  it("says on hover why 'Add another item' cannot be used yet", async () => {
    const user = setupUser();
    renderDialog();
    const addAnother = screen.getByRole("button", {
      name: "Add another item",
    });
    expect(addAnother).not.toHaveAttribute("title");
    // The hover text is on the wrapper, so it shows even though the button
    // cannot be clicked.
    await user.hover(addAnother);
    expect(
      await screen.findByText("Fill in all items before adding another"),
    ).toBeInTheDocument();
  });

  it("says nothing on hover over 'Add another item' once the item is complete", async () => {
    const user = setupUser();
    const { container } = renderDialog();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );

    await user.hover(screen.getByRole("button", { name: "Add another item" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.queryByText("Fill in all items before adding another"),
    ).not.toBeInTheDocument();
  });

  it("says on hover what the remove button on an item does", async () => {
    const user = setupUser();
    renderDialog();

    const remove = screen.getByRole("button", { name: "Remove item 1" });
    expect(remove).not.toHaveAttribute("title");
    await user.hover(remove);
    expect(await screen.findByText("Remove this item")).toBeInTheDocument();
  });

  it("does not repeat a file name the row shows in full", async () => {
    const user = setupUser();
    const { container } = renderDialog();

    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByText("clip.wav")).toBeInTheDocument(),
    );
    expect(screen.getByText("clip.wav")).not.toHaveAttribute("title");

    await user.hover(screen.getByText("clip.wav"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    // Still only the name beside the button, no popup repeating it.
    expect(screen.getAllByText("clip.wav")).toHaveLength(1);
  });

  it("shows the whole file name when the row has cut it off", async () => {
    const user = setupUser();
    // jsdom has no layout, so the cut-off name is described directly by
    // standing in for the two widths the row compares.
    const scrollWidth = jest
      .spyOn(HTMLElement.prototype, "scrollWidth", "get")
      .mockReturnValue(300);
    const clientWidth = jest
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockReturnValue(80);
    const longName = "a-very-long-recording-file-name-indeed.wav";
    const { container } = renderDialog();

    await pickFile(container, makeAudioFile(longName));
    await waitFor(() => expect(screen.getByText(longName)).toBeInTheDocument());

    await user.hover(screen.getByText(longName));
    await waitFor(() =>
      expect(screen.getAllByText(longName).length).toBeGreaterThan(1),
    );

    scrollWidth.mockRestore();
    clientWidth.mockRestore();
  });

  it("shows field validation errors when submitting with empty fields", async () => {
    const user = setupUser();
    const onSubmit = jest.fn();
    renderDialog({ onSubmit });
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    expect(screen.getByText("Reference text is required")).toBeInTheDocument();
    expect(screen.getByText("Audio is required")).toBeInTheDocument();
  });

  it("scrolls the first invalid field into view on failed submit", async () => {
    const user = setupUser();
    const scrollIntoView = jest.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderDialog();
      await user.click(screen.getByRole("button", { name: "Add item" }));
      expect(screen.getByText("Name is required")).toBeInTheDocument();
      await waitFor(() =>
        expect(scrollIntoView).toHaveBeenCalledWith(
          expect.objectContaining({
            behavior: "smooth",
            block: "nearest",
          }),
        ),
      );
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("rejects an over-sized audio file with an inline error", async () => {
    const { container } = renderDialog();
    await pickFile(container, makeAudioFile("big.wav", 999 * 1024 * 1024));
    await waitFor(() =>
      expect(screen.getByText(/Audio must be under/)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Play")).not.toBeInTheDocument();
    // Add-another stays disabled — the row has no valid audio.
    expect(
      screen.getByRole("button", { name: "Add another item" }),
    ).toBeDisabled();
  });

  it("uploads the picked audio to S3 and submits { name, text, audio_path }", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { container } = renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );

    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const presignedCall = (global.fetch as jest.Mock).mock.calls.find(
      ([u]) => typeof u === "string" && u.includes("/presigned-url"),
    );
    expect(JSON.parse(presignedCall[1].body).task_type).toBe("tts");
    expect(onSubmit).toHaveBeenCalledWith([
      {
        uuid: undefined,
        name: "Clip 1",
        text: "hello",
        audio_path: "tts/media/clip.wav",
        metadata: [],
      },
    ]);
    expect(screen.getByText("Metadata")).toBeInTheDocument();
  });

  it("keeps the metadata of a duplicated item when adding it", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    renderDialog({
      onSubmit,
      initialRows: [
        {
          uuid: "u1",
          name: "Clip 1 copy",
          text: "hello",
          audio: "https://x/a.wav",
          metadata: [{ key: "speaker", value: "A" }],
        },
      ],
    });
    expect(screen.getByDisplayValue("speaker")).toBeInTheDocument();
    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0][0].metadata).toEqual([
      { key: "speaker", value: "A" },
    ]);
  });

  it("surfaces an error and does not submit when the upload fails", async () => {
    presignedOk = false;
    const user = setupUser();
    const onSubmit = jest.fn();
    const { container } = renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );

    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() =>
      expect(screen.getByText(/Failed to upload audio/)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("does not re-upload audio when retrying after a rejected save", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValueOnce(
        new Error(
          'Request failed: 409 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Clip 1"]}}',
        ),
      )
      .mockResolvedValue(undefined);
    const { container } = renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );

    // First save is rejected — audio uploads once here.
    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // Retry succeeds — the file must NOT upload a second time.
    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2));

    const presignedCalls = (global.fetch as jest.Mock).mock.calls.filter(
      ([u]) => typeof u === "string" && u.includes("/presigned-url"),
    );
    expect(presignedCalls).toHaveLength(1);
    // The retry reused the stored key.
    expect(onSubmit.mock.calls[1][0][0].audio_path).toBe("tts/media/clip.wav");
  });

  it("shows a banner for a generic (non-conflict) save error", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(new Error("Request failed: 500 - Server exploded"));
    const { container } = renderDialog({ onSubmit });
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hi",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(await screen.findByText("Server exploded")).toBeInTheDocument();
  });

  it("falls back to a banner when a name conflict matches no visible row", async () => {
    const user = setupUser();
    const onSubmit = jest
      .fn()
      .mockRejectedValue(
        new Error(
          'Request failed: 409 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["Other"]}}',
        ),
      );
    const { container } = renderDialog({ onSubmit });
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hi",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole("button", { name: "Add item" }).click();
      for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    });
    expect(
      await screen.findByText(
        'An item named "Other" already exists in this task',
      ),
    ).toBeInTheDocument();
  });

  it("clears prior validation errors when a new card is added", async () => {
    const user = setupUser();
    const { container } = renderDialog();
    // Trigger validation on the empty first card.
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(screen.getByText("Name is required")).toBeInTheDocument();
    // Complete it, then add another — the fresh card must start clean.
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add another item" }),
      ).not.toBeDisabled(),
    );
    await user.click(screen.getByRole("button", { name: "Add another item" }));
    expect(screen.queryByText("Name is required")).not.toBeInTheDocument();
  });

  it("adds and removes rows once the first is complete", async () => {
    const user = setupUser();
    const { container } = renderDialog();
    // Complete the first card so "Add another item" enables.
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Add another item" }),
      ).not.toBeDisabled(),
    );

    await user.click(screen.getByRole("button", { name: "Add another item" }));
    expect(screen.getAllByPlaceholderText("e.g. Clip 1")).toHaveLength(2);
    await user.click(screen.getAllByLabelText(/Remove item/)[1]);
    expect(screen.getAllByPlaceholderText("e.g. Clip 1")).toHaveLength(1);
  });

  describe("edit mode", () => {
    const initialRows = [
      { uuid: "u1", name: "Clip 1", text: "hello", audio: "https://x/a.wav" },
    ];

    it("seeds existing audio and keeps it when not replaced", async () => {
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({ mode: "edit", initialRows, onSubmit });

      expect(screen.getByText("Edit items")).toBeInTheDocument();
      expect(screen.getByDisplayValue("Clip 1")).toBeInTheDocument();
      expect(screen.getByLabelText("Play")).toBeInTheDocument();
      expect(screen.getByText("Current audio")).toBeInTheDocument();

      await act(async () => {
        screen.getByRole("button", { name: "Save item" }).click();
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      });

      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      // No new upload — existing audio_path preserved.
      const presignedCalls = (global.fetch as jest.Mock).mock.calls.filter(
        ([u]) => typeof u === "string" && u.includes("/presigned-url"),
      );
      expect(presignedCalls).toHaveLength(0);
      expect(onSubmit).toHaveBeenCalledWith([
        {
          uuid: "u1",
          name: "Clip 1",
          text: "hello",
          audio_path: "https://x/a.wav",
          metadata: [],
        },
      ]);
    });

    it("shows each row's metadata and submits the edited fields", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({
        mode: "edit",
        onSubmit,
        initialRows: [
          { ...initialRows[0], metadata: [{ key: "speaker", value: "A" }] },
          { uuid: "u2", name: "Clip 2", text: "bye", audio: "https://x/b.wav" },
        ],
      });

      expect(screen.getAllByText("Metadata")).toHaveLength(2);
      expect(screen.getByDisplayValue("speaker")).toBeInTheDocument();
      const value = screen.getByDisplayValue("A");
      await user.clear(value);
      await user.type(value, "B");

      await act(async () => {
        screen.getByRole("button", { name: "Save 2 items" }).click();
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      });
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      expect(onSubmit.mock.calls[0][0].map((r: { metadata: unknown }) => r.metadata)).toEqual([
        [{ key: "speaker", value: "B" }],
        [],
      ]);
    });

    it("does not save while two metadata fields share a name", async () => {
      const user = setupUser();
      const onSubmit = jest.fn().mockResolvedValue(undefined);
      renderDialog({
        mode: "edit",
        onSubmit,
        initialRows: [
          { ...initialRows[0], metadata: [{ key: "speaker", value: "A" }] },
        ],
      });

      await user.click(screen.getByRole("button", { name: "Add field" }));
      await user.type(screen.getByLabelText("Metadata field name 2"), "speaker");
      expect(screen.getByText(/is already used by another field/)).toBeInTheDocument();

      const save = screen.getByRole("button", { name: "Save item" });
      expect(save).toBeDisabled();
      await act(async () => {
        save.click();
        for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
      });
      expect(onSubmit).not.toHaveBeenCalled();
    });

    it("does not count an empty added metadata field as a change", async () => {
      const user = setupUser();
      const { onClose } = renderDialog({ mode: "edit", initialRows });
      await user.click(screen.getByRole("button", { name: "Add field" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText("Discard changes?")).not.toBeInTheDocument();
    });
  });
});

describe("previous / next item in the edit window", () => {
  const step = {
    hasPrev: true,
    hasNext: true,
    position: { index: 4, total: 9 },
  };

  it("draws the arrows and steps when the form is clean", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    renderDialog({
      mode: "edit",
      initialRows: [{ uuid: "u1", name: "Clip 1", text: "hello", audio: "" }],
      onPrev,
      onNext,
      ...step,
    });
    expect(screen.getByText("5 of 9")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Previous item" }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("asks before stepping away from edits, and Discard steps", async () => {
    const user = setupUser();
    const onNext = jest.fn();
    const { onClose } = renderDialog({
      mode: "edit",
      initialRows: [{ uuid: "u1", name: "Clip 1", text: "hello", audio: "" }],
      onPrev: jest.fn(),
      onNext,
      ...step,
    });
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "x");
    await user.click(screen.getByRole("button", { name: "Next item" }));
    expect(onNext).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("Preview opens the view window at once when nothing has been edited", async () => {
    const user = setupUser();
    const onView = jest.fn();
    renderDialog({ mode: "edit", initialRows: [{ uuid: "u1", name: "Clip 1", text: "hello", audio: "" }], onView });
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onView).toHaveBeenCalledTimes(1);
  });

  it("Preview asks before throwing away edits, and opens the view on Discard", async () => {
    const user = setupUser();
    const onView = jest.fn();
    const { onClose } = renderDialog({ mode: "edit", initialRows: [{ uuid: "u1", name: "Clip 1", text: "hello", audio: "" }], onView });
    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "x");
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(onView).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Discard" }));
    expect(onView).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("draws no arrows when no steps are passed", () => {
    renderDialog({ mode: "edit", initialRows: [{ uuid: "u1", name: "Clip 1", text: "hello", audio: "" }] });
    expect(screen.queryByRole("button", { name: "Next item" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Preview" })).not.toBeInTheDocument();
  });
});
