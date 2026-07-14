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
    const addAnother = screen.getByRole("button", {
      name: "Add another item",
    });
    expect(addAnother).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The reference text that was spoken"),
      "hello",
    );
    expect(addAnother).toBeDisabled();

    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );
    expect(addAnother).not.toBeDisabled();
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
      },
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
        },
      ]);
    });
  });
});
