import {
  fetchDefaultLLMNextReplyEvaluator,
  isDefaultLLMNextReplyEvaluator,
  DEFAULT_LLM_NEXT_REPLY_SLUG,
} from "../defaultEvaluators";

describe("isDefaultLLMNextReplyEvaluator", () => {
  it("matches an unforked seed via slug", () => {
    expect(
      isDefaultLLMNextReplyEvaluator({ slug: DEFAULT_LLM_NEXT_REPLY_SLUG }),
    ).toBe(true);
  });

  it("matches an org fork via source_default_slug (slug nulled)", () => {
    expect(
      isDefaultLLMNextReplyEvaluator({
        slug: null,
        source_default_slug: DEFAULT_LLM_NEXT_REPLY_SLUG,
      }),
    ).toBe(true);
  });

  it("does not match a different default", () => {
    expect(
      isDefaultLLMNextReplyEvaluator({
        slug: null,
        source_default_slug: "default-conciseness",
      }),
    ).toBe(false);
  });
});

describe("fetchDefaultLLMNextReplyEvaluator", () => {
  const backendUrl = "https://api.example.com";
  const accessToken = "token-123";

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("calls the correct endpoint with headers", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(fetchMock).toHaveBeenCalledWith(
      `${backendUrl}/evaluators?include_defaults=true`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      },
    );
  });

  it("returns null when response is not ok", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toBeNull();
  });

  it("returns null when no matching evaluator is found", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [{ uuid: "1", name: "Other", slug: "other", evaluator_type: "llm" }],
      }),
    }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toBeNull();
  });

  it("returns the matching default evaluator (via items envelope)", async () => {
    const evaluator = {
      uuid: "1",
      name: "Default",
      slug: DEFAULT_LLM_NEXT_REPLY_SLUG,
      evaluator_type: "llm",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [evaluator] }),
    }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toEqual(evaluator);
  });

  it("returns the org fork whose slug is nulled but source_default_slug matches", async () => {
    const fork = {
      uuid: "1",
      name: "Correctness",
      slug: null,
      source_default_slug: DEFAULT_LLM_NEXT_REPLY_SLUG,
      evaluator_type: "llm",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [fork] }),
    }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toEqual(fork);
  });

  it("does not match when slug matches but evaluator_type does not", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        items: [
          {
            uuid: "1",
            name: "Wrong type",
            slug: DEFAULT_LLM_NEXT_REPLY_SLUG,
            evaluator_type: "stt",
          },
        ],
      }),
    }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toBeNull();
  });

  it("handles a bare-array response (unwrapList fallback)", async () => {
    const evaluator = {
      uuid: "1",
      name: "Default",
      slug: DEFAULT_LLM_NEXT_REPLY_SLUG,
      evaluator_type: "llm",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => [evaluator],
    }) as unknown as typeof fetch;

    const result = await fetchDefaultLLMNextReplyEvaluator(backendUrl, accessToken);

    expect(result).toEqual(evaluator);
  });
});
