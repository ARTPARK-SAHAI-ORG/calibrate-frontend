import React from "react";
import JSZip from "jszip";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { STTDatasetEditor, STTDatasetEditorHandle } from "../STTDatasetEditor";
import type { DatasetItem } from "../../../lib/datasets";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));
// Upload failures now funnel through the shared uploader's reportError.
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));
import { toast } from "sonner";
import { signOut } from "next-auth/react";

// ── Audio mocking ───────────────────────────────────────────────────────────
// `getAudioDuration` (module-private) creates `new Audio()`, sets `.src`, and
// relies on `onloadedmetadata`/`onerror` callback properties. `LazyAudioPlayer`
// (used for already-uploaded rows) instead uses addEventListener — support
// both so whichever code path runs doesn't blow up.
let mockDuration = 1;
let mockAudioError = false;

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
    if (mockAudioError) {
      setTimeout(() => {
        this.onerror?.();
        (this.listeners.error || []).forEach((cb) => cb());
      }, 0);
    } else {
      this.duration = mockDuration;
      setTimeout(() => {
        this.onloadedmetadata?.();
        (this.listeners.loadedmetadata || []).forEach((cb) => cb());
      }, 0);
    }
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

// ── fetch mocking (presigned URL + S3 PUT) ──────────────────────────────────
let presignedStatus = 200;
let presignedOk = true;
let presignedBody: any = { presigned_url: "https://s3.test/put", s3_path: "s3/audio.wav" };
let putOk = true;

function makeFile(name = "sample.wav", content = "x", type = "audio/wav") {
  return new File([content], name, { type });
}

function wavFile(name = "sample.wav") {
  return makeFile(name);
}

function makeItem(overrides: Partial<DatasetItem> = {}): DatasetItem {
  return {
    uuid: "item-1",
    text: "Reference text",
    audio_path: "https://cdn.test/audio/a.wav",
    order_index: 0,
    created_at: "2024-01-01T00:00:00Z",
    ...overrides,
  };
}

function Harness(props: Partial<React.ComponentProps<typeof STTDatasetEditor>>) {
  const ref = React.useRef<STTDatasetEditorHandle>(null);
  (Harness as any).ref = ref;
  return <STTDatasetEditor accessToken="tok" {...props} ref={ref} />;
}
function getHandle(): STTDatasetEditorHandle {
  return (Harness as any).ref.current;
}

function rowFileInputs(container: HTMLElement) {
  const all = Array.from(
    container.querySelectorAll('input[type="file"]'),
  ) as HTMLInputElement[];
  // The last file input is always the ZIP uploader (id="zip-upload-editor").
  return all.filter((el) => el.id !== "zip-upload-editor");
}

async function uploadWav(
  container: HTMLElement,
  file: File,
  index = 0,
) {
  const input = rowFileInputs(container)[index];
  await act(async () => {
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDuration = 1;
  mockAudioError = false;
  presignedStatus = 200;
  presignedOk = true;
  presignedBody = { presigned_url: "https://s3.test/put", s3_path: "s3/audio.wav" };
  putOk = true;

  (global as any).Audio = FakeAudio;
  (global as any).URL.createObjectURL = jest.fn(() => "blob:mock");
  (global as any).URL.revokeObjectURL = jest.fn();
  window.alert = jest.fn();
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";

  (global as any).fetch = jest.fn((url: string) => {
    if (typeof url === "string" && url.includes("/presigned-url")) {
      return Promise.resolve({
        status: presignedStatus,
        ok: presignedOk,
        json: async () => presignedBody,
      });
    }
    return Promise.resolve({ ok: putOk });
  });
});

describe("STTDatasetEditor", () => {
  it("renders a single blank row and no dataset-name field by default", () => {
    render(<Harness />);
    expect(screen.queryByText("Dataset name")).not.toBeInTheDocument();
    expect(screen.getAllByText("1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Upload .wav").length).toBeGreaterThan(0);
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
    await user.type(
      screen.getByPlaceholderText("e.g. English customer calls"),
      "y",
    );
    expect(onDatasetNameChange).toHaveBeenCalledWith("y");
  });

  it("applies invalid styling to the dataset name input", () => {
    render(<Harness showDatasetName datasetNameInvalid />);
    expect(
      screen.getByPlaceholderText("e.g. English customer calls").className,
    ).toContain("border-red-500");
  });

  it("rejects a non-.wav file via alert and does not upload", async () => {
    const { container } = render(<Harness />);
    const input = rowFileInputs(container)[0];
    const badFile = makeFile("clip.mp3", "x", "audio/mp3");
    await act(async () => {
      Object.defineProperty(input, "files", { value: [badFile], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(window.alert).toHaveBeenCalledWith("Please select a .wav file only");
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("uploads a valid wav file end to end and marks the row complete", async () => {
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "http://backend.test/presigned-url",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://s3.test/put",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    await waitFor(() =>
      expect(screen.getAllByText("Replace").length).toBeGreaterThan(0),
    );

    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await setupUser().type(textInputs[0], "hello world");

    await waitFor(() =>
      expect(getHandle().getNewRows()).toEqual([
        { audio_path: "s3/audio.wav", text: "hello world" },
      ]),
    );
    expect(getHandle().hasNewRows()).toBe(true);
    let ok = false;
    act(() => {
      ok = getHandle().validate();
    });
    expect(ok).toBe(true);
  });

  it("rejects an oversized audio file before uploading", async () => {
    const { container } = render(<Harness />);
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.wav", {
      type: "audio/wav",
    });
    await uploadWav(container, big);

    expect(toast.error).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("rejects an audio file whose duration is too long", async () => {
    mockDuration = 9999;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows an error toast when the audio file fails to load metadata", async () => {
    mockAudioError = true;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Failed to read audio file. Please try a different file.",
      ),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("marks the row upload as failed when the presigned URL request 401s and signs the user out", async () => {
    presignedStatus = 401;
    presignedOk = false;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
  });

  it("marks the row upload as failed when the presigned URL request otherwise fails", async () => {
    presignedStatus = 500;
    presignedOk = false;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
  });

  it("marks the row upload as failed when the presigned response is missing fields", async () => {
    presignedBody = {};
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
  });

  it("marks the row upload as failed when the S3 PUT fails", async () => {
    putOk = false;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    await waitFor(() =>
      expect(global.fetch).toHaveBeenCalledWith(
        "https://s3.test/put",
        expect.objectContaining({ method: "PUT" }),
      ),
    );
    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
  });

  it("returns null immediately (no fetch) when the backend URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears the audio state when the file input is cleared", async () => {
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    await waitFor(() =>
      expect(screen.getAllByText("Replace").length).toBeGreaterThan(0),
    );

    const input = rowFileInputs(container)[0];
    await act(async () => {
      Object.defineProperty(input, "files", { value: [], configurable: true });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(screen.queryByText("Replace")).not.toBeInTheDocument();
  });

  it("blocks adding a row while an existing row is incomplete", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "text only, no audio");
    await user.click(screen.getAllByText("Add another sample")[0]);

    expect(toast.error).toHaveBeenCalledWith(
      "Finish or clear incomplete rows before adding another sample.",
    );
    expect(
      screen.getAllByPlaceholderText("Enter reference transcription"),
    ).toHaveLength(2); // desktop + mobile copies of the single row
  });

  it("adds a new row once the current row is complete", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "complete row");
    await waitFor(() => {
      let ok = false;
      act(() => {
        ok = getHandle().validate();
      });
      expect(ok).toBe(true);
    });

    await user.click(screen.getAllByText("Add another sample")[0]);

    expect(
      screen.getAllByPlaceholderText("Enter reference transcription"),
    ).toHaveLength(4); // two rows x desktop/mobile
  });

  it("blocks adding rows past maxRowsPerEval with a limit toast", async () => {
    const user = setupUser();
    render(<Harness maxRowsPerEval={1} />);
    await user.click(screen.getAllByText("Add another sample")[0]);
    expect(toast.error).toHaveBeenCalled();
    expect(
      screen.getAllByPlaceholderText("Enter reference transcription"),
    ).toHaveLength(2);
  });

  it("validate() flags incomplete rows and leaves fully-blank rows alone", async () => {
    const user = setupUser();
    render(<Harness />);
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "text but no audio");

    let ok = true;
    act(() => {
      ok = getHandle().validate();
    });
    expect(ok).toBe(false);
  });

  it("does nothing when clicking delete on a fully blank new row", async () => {
    const { container } = render(<Harness />);
    // Only row present, no delete button rendered since savedCount=0 and length=1.
    expect(screen.queryByText("Clear row")).not.toBeInTheDocument();
  });

  it("opens the clear-row dialog and clears audio/text on confirm", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "some text");
    await user.click(screen.getAllByText("Add another sample")[0]);

    // Now two rows exist; row delete buttons appear. Grab all icon-only buttons
    // that are not "Add another sample" / "Replace" / upload buttons.
    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("hover:bg-accent") && b.textContent === "");
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Clear row")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear" }));

    await waitFor(() =>
      expect(
        (screen.getAllByPlaceholderText(
          "Enter reference transcription",
        )[0] as HTMLInputElement).value,
      ).toBe(""),
    );
  });

  it("cancels the clear-row dialog without clearing content", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "some text");
    await user.click(screen.getAllByText("Add another sample")[0]);

    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("hover:bg-accent") && b.textContent === "");
    await user.click(deleteButtons[0]);
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      (screen.getAllByPlaceholderText(
        "Enter reference transcription",
      )[0] as HTMLInputElement).value,
    ).toBe("some text");
  });

  it("clearNewRows resets to a single blank row via the imperative handle", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "some text");
    await user.click(screen.getAllByText("Add another sample")[0]);
    expect(
      screen.getAllByPlaceholderText("Enter reference transcription"),
    ).toHaveLength(4);

    act(() => getHandle().clearNewRows());

    await waitFor(() =>
      expect(
        screen.getAllByPlaceholderText("Enter reference transcription"),
      ).toHaveLength(2),
    );
  });

  it("clears the invalid marker for a row that already had text when its audio finishes uploading", async () => {
    const user = setupUser();
    const { container } = render(<Harness />);
    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    await user.type(textInputs[0], "text first");
    await uploadWav(container, wavFile());

    await waitFor(() =>
      expect(getHandle().getNewRows()).toEqual([
        { audio_path: "s3/audio.wav", text: "text first" },
      ]),
    );
  });

  it("shows the uploading spinner state while an upload is in flight", async () => {
    // Hold the presigned-URL fetch open so the "uploading" state is observable.
    let releasePresigned: () => void = () => {};
    const held = new Promise<void>((resolve) => {
      releasePresigned = resolve;
    });
    (global as any).fetch = jest.fn(async (url: string) => {
      if (typeof url === "string" && url.includes("/presigned-url")) {
        await held;
        return { status: presignedStatus, ok: presignedOk, json: async () => presignedBody };
      }
      return { ok: putOk };
    });

    const { container } = render(<Harness />);
    const input = rowFileInputs(container)[0];
    act(() => {
      Object.defineProperty(input, "files", {
        value: [wavFile()],
        configurable: true,
      });
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    await waitFor(() =>
      expect(screen.getAllByText("Uploading...").length).toBeGreaterThan(0),
    );

    await act(async () => {
      releasePresigned();
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => setTimeout(r, 0));
    });
  });

  it("allows deleting a row stuck in an error upload state", async () => {
    presignedStatus = 500;
    presignedOk = false;
    const user = setupUser();
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());
    await user.click(screen.getAllByText("Add another sample")[0]);

    const deleteButtons = screen
      .getAllByRole("button")
      .filter((b) => b.className.includes("hover:bg-accent") && b.textContent === "");
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Clear row")).toBeInTheDocument();
  });

  it("flags a row missing reference text after its audio uploads successfully", async () => {
    const { container } = render(<Harness />);
    await uploadWav(container, wavFile());

    let ok = true;
    act(() => {
      ok = getHandle().validate();
    });
    expect(ok).toBe(false);

    const textInputs = screen.getAllByPlaceholderText(
      "Enter reference transcription",
    );
    expect(textInputs[0].className).toContain("border-red-500");
  });

  describe("saved items", () => {
    it("renders a playable audio element for http audio_path and a filename badge otherwise", () => {
      const savedItems = [
        makeItem({ uuid: "a", audio_path: "https://cdn.test/a.wav" }),
        makeItem({ uuid: "b", audio_path: "s3://internal/b.wav", text: "Second" }),
      ];
      render(<Harness savedItems={savedItems} />);
      expect(screen.getAllByRole("button", { name: "Play" }).length).toBeGreaterThan(0);
      expect(screen.getAllByText("b.wav").length).toBeGreaterThan(0);
    });

    it("shows 'No audio' when a saved item has no audio_path", () => {
      const savedItems = [makeItem({ uuid: "a", audio_path: undefined })];
      render(<Harness savedItems={savedItems} />);
      expect(screen.getAllByText("No audio").length).toBeGreaterThan(0);
    });

    it("tracks edits to saved item transcripts as dirty updates", async () => {
      const user = setupUser();
      const savedItems = [makeItem({ uuid: "a", text: "Original" })];
      render(<Harness savedItems={savedItems} onDeleteSavedItem={jest.fn()} />);

      const inputs = screen.getAllByDisplayValue("Original");
      await user.clear(inputs[0]);
      await user.type(inputs[0], "Edited");

      await waitFor(() =>
        expect(getHandle().getDirtyUpdates()).toEqual([
          { uuid: "a", text: "Edited" },
        ]),
      );
      act(() => getHandle().clearDirtyUpdates());
      await waitFor(() => expect(getHandle().getDirtyUpdates()).toEqual([]));
    });

    it("blocks deleting the last saved item with a toast", async () => {
      const user = setupUser();
      const savedItems = [makeItem({ uuid: "a" })];
      render(<Harness savedItems={savedItems} onDeleteSavedItem={jest.fn()} />);

      await user.click(screen.getAllByRole("button", { name: "" }).filter(
        (b) => b.className.includes("hover:bg-accent"),
      )[0]);
      expect(toast.error).toHaveBeenCalledWith(
        "Dataset must have at least 2 items.",
      );
    });

    it("deletes a saved item through the confirmation dialog", async () => {
      const user = setupUser();
      const onDeleteSavedItem = jest.fn().mockResolvedValue(undefined);
      const savedItems = [
        makeItem({ uuid: "a" }),
        makeItem({ uuid: "b", text: "Second" }),
      ];
      render(
        <Harness savedItems={savedItems} onDeleteSavedItem={onDeleteSavedItem} />,
      );

      const deleteBtns = screen
        .getAllByRole("button", { name: "" })
        .filter((b) => b.className.includes("hover:bg-accent") && !b.className.includes("border"));
      await user.click(deleteBtns[0]);
      expect(screen.getByText("Remove this item from the dataset?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Remove" }));

      await waitFor(() => expect(onDeleteSavedItem).toHaveBeenCalledWith("a"));
    });

    it("resets the deleting state when onDeleteSavedItem rejects", async () => {
      const user = setupUser();
      const onDeleteSavedItem = jest.fn().mockRejectedValue(new Error("boom"));
      const savedItems = [makeItem({ uuid: "a" }), makeItem({ uuid: "b" })];
      render(
        <Harness savedItems={savedItems} onDeleteSavedItem={onDeleteSavedItem} />,
      );
      const deleteBtns = screen
        .getAllByRole("button", { name: "" })
        .filter((b) => b.className.includes("hover:bg-accent") && !b.className.includes("border"));
      await user.click(deleteBtns[0]);
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
      const deleteBtns = screen
        .getAllByRole("button", { name: "" })
        .filter((b) => b.className.includes("hover:bg-accent") && !b.className.includes("border"));
      await user.click(deleteBtns[0]);
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onDeleteSavedItem).not.toHaveBeenCalled();
    });
  });

  describe("ZIP upload", () => {
    async function zipInput(container: HTMLElement) {
      return container.querySelector("#zip-upload-editor") as HTMLInputElement;
    }

    async function buildZip(opts: {
      csv?: string;
      csvPath?: string;
      files?: Record<string, string>;
    }) {
      const zip = new JSZip();
      if (opts.csv !== undefined) {
        zip.file(opts.csvPath ?? "data.csv", opts.csv);
      }
      for (const [path, content] of Object.entries(opts.files ?? {})) {
        zip.file(path, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      return new File([blob], "upload.zip", { type: "application/zip" });
    }

    async function uploadZip(container: HTMLElement, file: File) {
      const input = await zipInput(container);
      await act(async () => {
        Object.defineProperty(input, "files", {
          value: [file],
          configurable: true,
        });
        input.dispatchEvent(new Event("change", { bubbles: true }));
        // Let the async zip-processing microtasks/macrotasks flush.
        for (let i = 0; i < 5; i++) {
          await new Promise((r) => setTimeout(r, 0));
        }
      });
    }

    it("downloads a sample ZIP via an anchor click", async () => {
      const clickSpy = jest
        .spyOn(HTMLAnchorElement.prototype, "click")
        .mockImplementation(() => {});
      render(<Harness />);
      await act(async () => {
        screen.getByText("Download sample ZIP").click();
        await new Promise((r) => setTimeout(r, 0));
      });
      await waitFor(() => expect(clickSpy).toHaveBeenCalled());
      clickSpy.mockRestore();
    });

    it("rejects a ZIP with no data.csv", async () => {
      const { container } = render(<Harness />);
      const file = await buildZip({ files: { "readme.txt": "hi" } });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "ZIP must contain a data.csv file",
        ),
      );
    });

    it("rejects a data.csv with fewer than 2 lines", async () => {
      const { container } = render(<Harness />);
      const file = await buildZip({ csv: "audio_file,text" });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining("must have a header and at least one data row"),
        ),
      );
    });

    it("rejects a data.csv missing required columns", async () => {
      const { container } = render(<Harness />);
      const file = await buildZip({ csv: "foo,bar\n1,2" });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "data.csv must have 'audio_file' and 'text' columns",
        ),
      );
    });

    it("rejects a data.csv with no valid data rows", async () => {
      const { container } = render(<Harness />);
      const file = await buildZip({ csv: "audio_file,text\n,\n" });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          "No valid data rows found in data.csv",
        ),
      );
    });

    it("rejects a ZIP producing more rows than maxRowsPerEval", async () => {
      const { container } = render(<Harness maxRowsPerEval={1} />);
      const file = await buildZip({
        csv: "audio_file,text\na.wav,One\nb.wav,Two",
      });
      await uploadZip(container, file);

      await waitFor(() => expect(toast.error).toHaveBeenCalled());
    });

    it("processes a valid ZIP, uploads referenced audio to S3, and tolerates a missing audio entry", async () => {
      const { container } = render(<Harness />);
      const file = await buildZip({
        csv: "audio_file,text\nsample_1.wav,First line\nmissing.wav,Second line",
        files: { "audios/sample_1.wav": "fakewavbytes" },
      });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(
          screen.getAllByPlaceholderText("Enter reference transcription"),
        ).toHaveLength(4),
      );
      expect(screen.getAllByDisplayValue("First line").length).toBeGreaterThan(0);
      expect(screen.getAllByDisplayValue("Second line").length).toBeGreaterThan(0);

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "http://backend.test/presigned-url",
          expect.objectContaining({ method: "POST" }),
        ),
      );
    });

    it("aborts when an audio entry in the ZIP exceeds the max file size", async () => {
      const { container } = render(<Harness />);
      const bigContent = "a".repeat(6 * 1024 * 1024);
      const file = await buildZip({
        csv: "audio_file,text\nbig.wav,Too big",
        files: { "audios/big.wav": bigContent },
      });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining("exceeds"),
        ),
      );
    });

    it("aborts when an audio entry in the ZIP exceeds the max duration", async () => {
      mockDuration = 9999;
      const { container } = render(<Harness />);
      const file = await buildZip({
        csv: "audio_file,text\nlong.wav,Too long",
        files: { "audios/long.wav": "fakewavbytes" },
      });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          expect.stringContaining("exceeds"),
        ),
      );
    });

    it("shows a generic error toast when the ZIP file cannot be parsed", async () => {
      const { container } = render(<Harness />);
      const notAZip = new File(["not a zip"], "bad.zip", {
        type: "application/zip",
      });
      await uploadZip(container, notAZip);

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith("Failed to process ZIP file"),
      );
    });

    it("finds data.csv nested inside a single top-level folder", async () => {
      const { container } = render(<Harness />);
      const zip = new JSZip();
      const folder = zip.folder("mydata")!;
      folder.file(
        "data.csv",
        "audio_file,text\nsample_1.wav,Nested first line",
      );
      folder.folder("audios")!.file("sample_1.wav", "fakewavbytes");
      const blob = await zip.generateAsync({ type: "blob" });
      const file = new File([blob], "nested.zip", { type: "application/zip" });

      await uploadZip(container, file);

      await waitFor(() =>
        expect(
          screen.getAllByDisplayValue("Nested first line").length,
        ).toBeGreaterThan(0),
      );
    });

    it("marks a row as failed when its S3 upload fails during ZIP processing", async () => {
      putOk = false;
      const { container } = render(<Harness />);
      const file = await buildZip({
        csv: "audio_file,text\nsample_1.wav,First line",
        files: { "audios/sample_1.wav": "fakewavbytes" },
      });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(global.fetch).toHaveBeenCalledWith(
          "https://s3.test/put",
          expect.objectContaining({ method: "PUT" }),
        ),
      );
      expect(screen.queryByText("Replace")).not.toBeInTheDocument();
    });

    it("tolerates a duration-check failure for a ZIP audio entry and still includes the row", async () => {
      const { container } = render(<Harness />);
      // Force getAudioDuration to reject (onerror) instead of resolving.
      mockAudioError = true;
      const file = await buildZip({
        csv: "audio_file,text\nsample_1.wav,First line",
        files: { "audios/sample_1.wav": "fakewavbytes" },
      });
      await uploadZip(container, file);

      await waitFor(() =>
        expect(
          screen.getAllByPlaceholderText("Enter reference transcription")
            .length,
        ).toBeGreaterThan(0),
      );
      expect(screen.getAllByDisplayValue("First line").length).toBeGreaterThan(0);
    });

    it("does nothing when no ZIP file is selected", async () => {
      const { container } = render(<Harness />);
      const input = await zipInput(container);
      await act(async () => {
        Object.defineProperty(input, "files", { value: [], configurable: true });
        input.dispatchEvent(new Event("change", { bubbles: true }));
      });
      expect(toast.error).not.toHaveBeenCalled();
    });
  });
});
