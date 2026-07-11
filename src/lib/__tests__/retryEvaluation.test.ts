import { retryEvaluation } from "@/lib/retryEvaluation";

// See parseBackendError.test.ts for why a relative specifier is used here.
jest.mock("../reportError", () => ({
  reportError: jest.fn(),
}));

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

function mockFetchResponse(status: number, jsonBody?: unknown, jsonThrows = false) {
  const json = jsonThrows
    ? jest.fn().mockRejectedValue(new Error("bad json"))
    : jest.fn().mockResolvedValue(jsonBody);
  return {
    status,
    ok: status >= 200 && status < 300,
    json,
    clone() {
      return this;
    },
  } as unknown as Response;
}

describe("retryEvaluation", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    global.fetch = jest.fn();
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = ORIGINAL_ENV;
    jest.restoreAllMocks();
  });

  it("errors when backend URL is not configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({ ok: false, error: "Backend URL is not configured." });
  });

  it("errors when task id is missing", async () => {
    const result = await retryEvaluation("stt", "", "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/missing task id/);
    }
  });

  it("posts to the retry endpoint and returns the same task id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, {
        task_id: "task-1",
        status: "in_progress",
      }),
    );

    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({
      ok: true,
      taskId: "task-1",
      status: "in_progress",
    });

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/stt/evaluate/task-1/retry");
    expect(init.method).toBe("POST");
    expect(init.body).toBeUndefined();
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  it("uses the matching TTS retry path", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, { task_id: "task-tts", status: "queued" }),
    );

    const result = await retryEvaluation("tts", "task-tts", "token");
    expect(result.ok).toBe(true);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/tts/evaluate/task-tts/retry");
  });

  it("returns a network-error message when fetch rejects with an Error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("connection refused"));
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({ ok: false, error: "connection refused" });
  });

  it("returns a generic network error message when fetch rejects with a non-Error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue("boom");
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({ ok: false, error: "Network error." });
  });

  it("returns a 401-specific error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(401));
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({
      ok: false,
      error: "Session expired. Please sign in again.",
      status: 401,
    });
  });

  it("delegates non-ok, non-401 responses to parseBackendErrorResponse", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(400, {
        detail: "Cannot retry a job that is still in progress",
      }),
    );
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({
      ok: false,
      error: "Cannot retry a job that is still in progress",
      status: 400,
    });
  });

  it("errors when the success response has no task_id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(200, {}));
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({
      ok: false,
      error: "Retry succeeded but no task id was returned.",
    });
  });

  it("treats a non-JSON success body as empty and reports missing task id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, undefined, true),
    );
    const result = await retryEvaluation("stt", "task-1", "token");
    expect(result).toEqual({
      ok: false,
      error: "Retry succeeded but no task id was returned.",
    });
  });
});
