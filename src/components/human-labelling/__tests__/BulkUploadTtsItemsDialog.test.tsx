import React from "react";
import JSZip from "jszip";
import { render, screen, waitFor, act } from "@/test-utils";
import { BulkUploadTtsItemsDialog } from "../BulkUploadTtsItemsDialog";

jest.mock("../../../lib/api", () => ({
  apiClient: jest.fn(() => Promise.resolve({})),
}));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));
import { apiClient } from "../../../lib/api";

// getAudioDuration creates `new Audio()`, sets `.src`, and relies on the
// onloadedmetadata/onerror callback props. LazyAudioPlayer uses
// addEventListener — support both.
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
let putOk = true;

beforeEach(() => {
  jest.clearAllMocks();
  mockDuration = 1;
  presignedOk = true;
  putOk = true;
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
    return Promise.resolve({ ok: putOk });
  });
});

async function buildZip(opts: {
  csv?: string;
  files?: Record<string, string>;
}) {
  const zip = new JSZip();
  if (opts.csv !== undefined) zip.file("data.csv", opts.csv);
  for (const [path, content] of Object.entries(opts.files ?? {})) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  return new File([blob], "upload.zip", { type: "application/zip" });
}

async function uploadZip(container: HTMLElement, file: File) {
  const input = container.querySelector(
    "#tts-zip-upload",
  ) as HTMLInputElement;
  await act(async () => {
    Object.defineProperty(input, "files", {
      value: [file],
      configurable: true,
    });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
  });
}

function renderDialog(
  props: Partial<React.ComponentProps<typeof BulkUploadTtsItemsDialog>> = {},
) {
  const onClose = jest.fn();
  const onSuccess = jest.fn();
  const utils = render(
    <BulkUploadTtsItemsDialog
      isOpen
      accessToken="tok"
      taskUuid="task-1"
      onClose={onClose}
      onSuccess={onSuccess}
      {...props}
    />,
  );
  return { onClose, onSuccess, ...utils };
}

describe("BulkUploadTtsItemsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <BulkUploadTtsItemsDialog
        isOpen={false}
        accessToken="tok"
        taskUuid="task-1"
        onClose={jest.fn()}
        onSuccess={jest.fn()}
      />,
    );
    expect(screen.queryByText("Bulk upload items")).not.toBeInTheDocument();
  });

  it("renders the ZIP instructions and a disabled upload button initially", () => {
    renderDialog();
    expect(screen.getByText("Bulk upload items")).toBeInTheDocument();
    expect(screen.getByText("Select ZIP file")).toBeInTheDocument();
    expect(screen.getByText("Download sample ZIP")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload item" })).toBeDisabled();
  });

  it("downloads a sample ZIP via an anchor click", async () => {
    const clickSpy = jest
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    renderDialog();
    await act(async () => {
      screen.getByText("Download sample ZIP").click();
      await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() => expect(clickSpy).toHaveBeenCalled());
    clickSpy.mockRestore();
  });

  it("rejects a ZIP with no data.csv", async () => {
    const { container } = renderDialog();
    await uploadZip(container, await buildZip({ files: { "readme.txt": "hi" } }));
    await waitFor(() =>
      expect(
        screen.getByText("ZIP must contain a data.csv file."),
      ).toBeInTheDocument(),
    );
  });

  it("rejects a data.csv missing required columns", async () => {
    const { container } = renderDialog();
    await uploadZip(container, await buildZip({ csv: "foo,bar\n1,2" }));
    await waitFor(() =>
      expect(
        screen.getByText('data.csv must have "text" and "audio_file" columns.'),
      ).toBeInTheDocument(),
    );
  });

  it("rejects when a referenced audio file is missing from the ZIP", async () => {
    const { container } = renderDialog();
    await uploadZip(
      container,
      await buildZip({ csv: "name,text,audio_file\nClip,Hi,missing.wav" }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Row 1: audio file "missing.wav" not found in ZIP.',
        ),
      ).toBeInTheDocument(),
    );
  });

  it("parses a valid ZIP, previews rows, uploads audio to S3, and creates items", async () => {
    const { container, onSuccess } = renderDialog();
    await uploadZip(
      container,
      await buildZip({
        csv: "name,text,audio_file\nGreeting,Hello there,a.wav",
        files: { "audios/a.wav": "RIFFfakeaudio" },
      }),
    );

    // Preview shows the parsed row.
    await waitFor(() =>
      expect(screen.getByText("Greeting")).toBeInTheDocument(),
    );
    expect(screen.getByText("Hello there")).toBeInTheDocument();

    const uploadButton = screen.getByRole("button", { name: "Upload item" });
    expect(uploadButton).not.toBeDisabled();

    await act(async () => {
      uploadButton.click();
      for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    });

    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith(1));
    // Presigned URL requested with the tts task_type.
    const presignedCall = (global.fetch as jest.Mock).mock.calls.find(
      ([url]) => typeof url === "string" && url.includes("/presigned-url"),
    );
    expect(JSON.parse(presignedCall[1].body).task_type).toBe("tts");
    // Items POSTed with the resolved s3 path.
    expect(apiClient).toHaveBeenCalledWith(
      "/annotation-tasks/task-1/items",
      "tok",
      expect.objectContaining({
        method: "POST",
        body: {
          items: [
            {
              payload: {
                name: "Greeting",
                text: "Hello there",
                audio_path: "tts/media/clip.wav",
              },
            },
          ],
        },
      }),
    );
  });

  it("defaults the item name to the audio filename when the name column is blank", async () => {
    const { container } = renderDialog();
    await uploadZip(
      container,
      await buildZip({
        csv: "name,text,audio_file\n,Hello there,clip_42.wav",
        files: { "audios/clip_42.wav": "RIFFfakeaudio" },
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("clip_42")).toBeInTheDocument(),
    );
  });

  it("surfaces an error and saves nothing when an audio upload fails", async () => {
    presignedOk = false;
    const { container, onSuccess } = renderDialog();
    await uploadZip(
      container,
      await buildZip({
        csv: "name,text,audio_file\nGreeting,Hello there,a.wav",
        files: { "audios/a.wav": "RIFFfakeaudio" },
      }),
    );
    await waitFor(() =>
      expect(screen.getByText("Greeting")).toBeInTheDocument(),
    );
    await act(async () => {
      screen.getByRole("button", { name: "Upload item" }).click();
      for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
    });
    await waitFor(() =>
      expect(
        screen.getByText(/failed to upload. Nothing was saved/),
      ).toBeInTheDocument(),
    );
    expect(onSuccess).not.toHaveBeenCalled();
    expect(apiClient).not.toHaveBeenCalled();
  });
});
