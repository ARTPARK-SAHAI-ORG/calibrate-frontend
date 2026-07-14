import {
  getAudioDuration,
  validateTtsAudioFile,
  uploadTtsAudioToS3,
} from "../ttsAudioUpload";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// `getAudioDuration` creates `new Audio()`, sets `.src`, then relies on
// onloadedmetadata / onerror. FakeAudio fires whichever the test selects.
let mockDuration = 1;
let mockAudioError = false;
class FakeAudio {
  onloadedmetadata: (() => void) | null = null;
  onerror: (() => void) | null = null;
  duration = 0;
  set src(_v: string) {
    setTimeout(() => {
      if (mockAudioError) {
        this.onerror?.();
      } else {
        this.duration = mockDuration;
        this.onloadedmetadata?.();
      }
    }, 0);
  }
}

function audioFile(sizeBytes?: number) {
  const file = new File(["x"], "clip.wav", { type: "audio/wav" });
  if (sizeBytes != null) {
    Object.defineProperty(file, "size", { value: sizeBytes });
  }
  return file;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDuration = 1;
  mockAudioError = false;
  (global as unknown as { Audio: unknown }).Audio = FakeAudio;
  global.URL.createObjectURL = jest.fn(() => "blob:mock");
  global.URL.revokeObjectURL = jest.fn();
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
});

describe("getAudioDuration", () => {
  it("resolves with the media duration", async () => {
    mockDuration = 3.5;
    await expect(getAudioDuration(audioFile())).resolves.toBe(3.5);
  });

  it("rejects when the audio fails to load", async () => {
    mockAudioError = true;
    await expect(getAudioDuration(audioFile())).rejects.toThrow(
      "Failed to load audio",
    );
  });
});

describe("validateTtsAudioFile", () => {
  it("returns null for an acceptable file", async () => {
    await expect(validateTtsAudioFile(audioFile())).resolves.toBeNull();
  });

  it("rejects an over-sized file", async () => {
    const msg = await validateTtsAudioFile(audioFile(999 * 1024 * 1024));
    expect(msg).toMatch(/Audio must be under/);
  });

  it("rejects an over-long clip", async () => {
    mockDuration = 9999;
    const msg = await validateTtsAudioFile(audioFile());
    expect(msg).toMatch(/Audio must be under/);
  });

  it("passes when the duration probe fails (best-effort)", async () => {
    mockAudioError = true;
    await expect(validateTtsAudioFile(audioFile())).resolves.toBeNull();
  });
});

describe("uploadTtsAudioToS3", () => {
  function mockFetch(
    handlers: {
      presigned?: { status?: number; ok?: boolean; body?: unknown };
      putOk?: boolean;
    } = {},
  ) {
    const presigned = handlers.presigned ?? {
      status: 200,
      ok: true,
      body: { presigned_url: "https://s3.test/put", s3_path: "tts/media/a.wav" },
    };
    (global as unknown as { fetch: unknown }).fetch = jest.fn(
      (url: string) => {
        if (typeof url === "string" && url.includes("/presigned-url")) {
          return Promise.resolve({
            status: presigned.status ?? 200,
            ok: presigned.ok ?? true,
            json: async () => presigned.body ?? {},
          });
        }
        return Promise.resolve({ ok: handlers.putOk ?? true });
      },
    );
  }

  it("returns the s3 path from the API on success", async () => {
    mockFetch();
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBe(
      "tts/media/a.wav",
    );
  });

  it("returns null and signs out on a 401", async () => {
    mockFetch({ presigned: { status: 401, ok: false } });
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBeNull();
  });

  it("returns null when the presigned request is not ok", async () => {
    mockFetch({ presigned: { status: 500, ok: false } });
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBeNull();
  });

  it("returns null when the response is missing the url/path", async () => {
    mockFetch({ presigned: { status: 200, ok: true, body: {} } });
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBeNull();
  });

  it("returns null when the S3 PUT fails", async () => {
    mockFetch({ putOk: false });
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBeNull();
  });

  it("returns null when no backend URL is configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    await expect(uploadTtsAudioToS3(audioFile(), "tok")).resolves.toBeNull();
  });
});
