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
          s3_path: "tts/audio.wav",
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
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Upload audio" }),
    ).toBeInTheDocument();
    // No pasted-URL field anymore.
    expect(
      screen.queryByPlaceholderText("https://.../audio.wav"),
    ).not.toBeInTheDocument();
  });

  it("keeps Add disabled until name, text and an audio file are all present", async () => {
    const user = setupUser();
    const { container } = renderDialog();
    const addButton = screen.getByRole("button", { name: "Add item" });
    expect(addButton).toBeDisabled();

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The text that was spoken"),
      "hello",
    );
    expect(addButton).toBeDisabled();

    await pickFile(container, makeAudioFile());
    await waitFor(() =>
      expect(screen.getByLabelText("Play")).toBeInTheDocument(),
    );
    expect(addButton).not.toBeDisabled();
  });

  it("rejects an over-sized audio file with an inline error", async () => {
    const { container } = renderDialog();
    await pickFile(container, makeAudioFile("big.wav", 999 * 1024 * 1024));
    await waitFor(() =>
      expect(screen.getByText(/Audio must be under/)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText("Play")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add item" })).toBeDisabled();
  });

  it("uploads the picked audio to S3 and submits { name, text, audio_path }", async () => {
    const user = setupUser();
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    const { container } = renderDialog({ onSubmit });

    await user.type(screen.getByPlaceholderText("e.g. Clip 1"), "Clip 1");
    await user.type(
      screen.getByPlaceholderText("The text that was spoken"),
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
        audio_path: "tts/audio.wav",
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
      screen.getByPlaceholderText("The text that was spoken"),
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

  it("adds and removes rows", async () => {
    const user = setupUser();
    renderDialog();
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
