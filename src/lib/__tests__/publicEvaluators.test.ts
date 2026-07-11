import { getPublicDefaultEvaluator } from "../publicEvaluators";

describe("getPublicDefaultEvaluator", () => {
  const backendUrl = "https://api.example.com";
  const shareToken = "share-token-abc";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls the correct endpoint with encoded share token", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [],
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await getPublicDefaultEvaluator(backendUrl, "a b/c", "llm");

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/public/evaluators/defaults?share_token=${encodeURIComponent(
        "a b/c",
      )}&types=llm`,
      { headers: { accept: "application/json" } },
    );
  });

  it("returns null when response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const result = await getPublicDefaultEvaluator(backendUrl, shareToken, "stt");

    expect(result).toBeNull();
  });

  it("returns null when no evaluator matches the type", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { uuid: "1", name: "TTS one", evaluator_type: "tts", output_type: "binary" },
      ],
    }) as unknown as typeof fetch;

    const result = await getPublicDefaultEvaluator(backendUrl, shareToken, "stt");

    expect(result).toBeNull();
  });

  it("returns the matching evaluator", async () => {
    const evaluator = {
      uuid: "1",
      name: "STT one",
      evaluator_type: "stt" as const,
      output_type: "binary" as const,
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [evaluator],
    }) as unknown as typeof fetch;

    const result = await getPublicDefaultEvaluator(backendUrl, shareToken, "stt");

    expect(result).toEqual(evaluator);
  });
});
