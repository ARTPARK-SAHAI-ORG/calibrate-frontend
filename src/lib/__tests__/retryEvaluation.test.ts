import { retryEvaluation, type RetryableEvaluation } from "@/lib/retryEvaluation";

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
    const result = await retryEvaluation("stt", {}, "token");
    expect(result).toEqual({ ok: false, error: "Backend URL is not configured." });
  });

  it("errors when dataset_id is missing", async () => {
    const result = await retryEvaluation("stt", {}, "token");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/no saved dataset/);
    }
  });

  it("errors when provider_results is entirely absent", async () => {
    const result = await retryEvaluation("stt", { dataset_id: "d1" }, "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/which providers/);
  });

  it("errors when there are no providers", async () => {
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      provider_results: [],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/which providers/);
  });

  it("errors when there are no evaluator uuids", async () => {
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/which evaluators/);
  });

  it("unions evaluator_runs uuids and legacy evaluator_uuids, and posts successfully", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, { task_id: "task-1" }),
    );
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      language: "en",
      evaluator_uuids: ["e1", "e2"],
      provider_results: [
        {
          provider: "deepgram",
          evaluator_runs: [{ evaluator_uuid: "e2" }, { evaluator_uuid: "e3" }, {}],
        },
      ],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({ ok: true, taskId: "task-1" });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/stt/evaluate");
    const body = JSON.parse(init.body);
    expect(body.dataset_id).toBe("d1");
    expect(body.providers).toEqual(["deepgram"]);
    expect(new Set(body.evaluator_uuids)).toEqual(new Set(["e1", "e2", "e3"]));
    expect(init.headers.Authorization).toBe("Bearer token");
  });

  it("recovers providers and evaluators from /jobs config when the failed run emitted no rows", async () => {
    // A run that failed at the start has empty provider_results / evaluator_runs
    // and no top-level evaluator_uuids — everything must come from /jobs.
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockFetchResponse(200, {
          jobs: [
            {
              uuid: "task-x",
              details: {
                providers: ["deepgram", "whisper", ""],
                language: "hi",
                evaluator_uuids: ["e1", "e2"],
              },
            },
            { uuid: "other", details: { providers: ["nope"] } },
          ],
        }),
      )
      .mockResolvedValueOnce(mockFetchResponse(200, { task_id: "retry-1" }));

    const evaluation: RetryableEvaluation = {
      task_id: "task-x",
      dataset_id: "d1",
      provider_results: [],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({ ok: true, taskId: "retry-1" });

    const [jobsUrl] = (global.fetch as jest.Mock).mock.calls[0];
    expect(jobsUrl).toBe("http://backend.test/jobs?job_type=stt");
    const [postUrl, init] = (global.fetch as jest.Mock).mock.calls[1];
    expect(postUrl).toBe("http://backend.test/stt/evaluate");
    const body = JSON.parse(init.body);
    expect(body.providers).toEqual(["deepgram", "whisper"]);
    expect(new Set(body.evaluator_uuids)).toEqual(new Set(["e1", "e2"]));
    expect(body.language).toBe("hi");
  });

  it("does not call /jobs when result-time providers and evaluators are already present", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, { task_id: "t" }),
    );
    const evaluation: RetryableEvaluation = {
      task_id: "task-x",
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result.ok).toBe(true);
    // Only the POST — no /jobs lookup.
    expect((global.fetch as jest.Mock).mock.calls).toHaveLength(1);
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://backend.test/stt/evaluate",
    );
  });

  it("still errors when /jobs config can't fill the gap", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockFetchResponse(200, { jobs: [] }),
    );
    const evaluation: RetryableEvaluation = {
      task_id: "task-x",
      dataset_id: "d1",
      provider_results: [],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/which providers/);
  });

  it("filters out falsy providers", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(200, { task_id: "t" }),
    );
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "" }, { provider: "deepgram" }],
    };
    const result = await retryEvaluation("tts", evaluation, "token");
    expect(result.ok).toBe(true);
    const [url] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/tts/evaluate");
  });

  it("returns a network-error message when fetch rejects with an Error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("connection refused"));
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({ ok: false, error: "connection refused" });
  });

  it("returns a generic network error message when fetch rejects with a non-Error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue("boom");
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({ ok: false, error: "Network error." });
  });

  it("returns a 401-specific error", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(401));
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({
      ok: false,
      error: "Session expired. Please sign in again.",
      status: 401,
    });
  });

  it("delegates non-ok, non-401 responses to parseBackendErrorResponse", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(
      mockFetchResponse(404, { detail: "Dataset not found" }),
    );
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({ ok: false, error: "Dataset not found", status: 404 });
  });

  it("errors when the success response has no task_id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(200, {}));
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({
      ok: false,
      error: "Retry succeeded but no task id was returned.",
    });
  });

  it("treats a non-JSON success body as empty and reports missing task id", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(mockFetchResponse(200, undefined, true));
    const evaluation: RetryableEvaluation = {
      dataset_id: "d1",
      evaluator_uuids: ["e1"],
      provider_results: [{ provider: "deepgram" }],
    };
    const result = await retryEvaluation("stt", evaluation, "token");
    expect(result).toEqual({
      ok: false,
      error: "Retry succeeded but no task id was returned.",
    });
  });
});
