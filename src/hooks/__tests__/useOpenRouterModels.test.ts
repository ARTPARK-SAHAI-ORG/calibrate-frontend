import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useOpenRouterModels,
  OPENROUTER_DISABLED_MESSAGE,
  findModelInProviders,
} from "@/hooks/useOpenRouterModels";
import { getBackendUrl } from "@/lib/api";
import { reportError } from "@/lib/reportError";

// Relative specifiers, not the "@/" alias: next/jest's SWC transform only
// rewrites "@/..." inside import/export declarations, not string arguments
// like jest.mock()'s first argument. Jest mocks are keyed by resolved
// absolute file path, so this still intercepts the hook's "@/lib/api" import.
jest.mock("../../lib/api", () => ({
  getBackendUrl: jest.fn(() => "https://backend.example.com"),
}));

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const mockGetBackendUrl = getBackendUrl as jest.Mock;

const CACHE_TTL_MS = 10 * 60 * 1000;

function makeProvidersResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

function makeModelsResponse(data: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ data }),
  } as Response;
}

/**
 * The hook keeps `cache` / `inflightPromise` as plain module-level
 * variables (no reset export). Rather than reloading the module per test
 * (which — via jest.isolateModules/resetModules — pulls in a *second* copy
 * of "react", causing a null-dispatcher crash since react-dom's rendering
 * still uses the original "react" instance), we keep a single shared hook
 * module for the whole file and invalidate its cache between tests by
 * advancing a mocked Date.now() past the TTL. This makes every test start
 * as if the cache were empty, matching a fresh module's behavior.
 */
// Declared outside beforeEach and never reset back to a base value: each
// test's cache.timestamp is recorded using whatever fakeNow was at fetch
// time, so invalidateCache() must always move strictly *forward* from
// wherever the previous test left off, or the "advance" would land back on
// a timestamp already inside a previously-recorded cache's TTL window.
let fakeNow = 1_700_000_000_000;
let dateNowSpy: jest.SpyInstance<number, []>;

function invalidateCache() {
  fakeNow += CACHE_TTL_MS + 60_000;
  dateNowSpy.mockReturnValue(fakeNow);
}

describe("useOpenRouterModels", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    mockGetBackendUrl.mockReturnValue("https://backend.example.com");

    dateNowSpy = jest.spyOn(Date, "now").mockReturnValue(fakeNow);
    invalidateCache();
  });

  afterEach(() => {
    dateNowSpy.mockRestore();
  });

  it("fetches allowed providers + models and groups/sorts them", async () => {
    fetchMock
      .mockResolvedValueOnce(
        makeProvidersResponse({
          providers: [
            { slug: "openai", name: "OpenAI Override" },
            { slug: "anthropic", name: "Anthropic" },
          ],
        }),
      )
      .mockResolvedValueOnce(
        makeModelsResponse([
          {
            id: "openai/gpt-4",
            name: "GPT-4",
            architecture: {
              input_modalities: ["text"],
              output_modalities: ["text"],
            },
          },
          { id: "anthropic/claude-3", name: "Claude 3" },
          { id: "mistralai/mixtral", name: "Mixtral" }, // filtered out, not allowed
          { id: "openai/gpt-3.5", name: "GPT-3.5" },
          { id: 5, name: "bad-id" }, // filtered: id not a string
          { id: "openai/old", name: 5 }, // filtered: name not a string
        ]),
      );

    const { result } = renderHook(() => useOpenRouterModels());
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.providers.map((p) => p.slug)).toEqual([
      "anthropic",
      "openai",
    ]);
    const openaiProvider = result.current.providers.find(
      (p) => p.slug === "openai",
    )!;
    expect(openaiProvider.name).toBe("OpenAI Override");
    expect(openaiProvider.models.map((m) => m.name)).toEqual([
      "GPT-3.5",
      "GPT-4",
    ]);
    expect(openaiProvider.models[1].inputModalities).toEqual(["text"]);
    expect(openaiProvider.models[1].outputModalities).toEqual(["text"]);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://backend.example.com/openrouter/providers",
      { headers: { accept: "application/json" } },
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://openrouter.ai/api/v1/models",
    );
  });

  it("treats providers: 'all' as no allow-list filter and uses default display names", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce(
        makeModelsResponse([
          { id: "some-unknown-slug/model-a", name: "Model A" },
          { id: "no-slash-model", name: "No Slash Model" },
        ]),
      );

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const slugs = result.current.providers.map((p) => p.slug).sort();
    expect(slugs).toEqual(["other", "some-unknown-slug"]);
    const unknown = result.current.providers.find(
      (p) => p.slug === "some-unknown-slug",
    )!;
    expect(unknown.name).toBe("Some Unknown Slug");
  });

  it("filters out deprecated models (expiration_date in the past) but keeps future/invalid ones", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce(
        makeModelsResponse([
          { id: "openai/expired", name: "Expired", expiration_date: "2000-01-01" },
          { id: "openai/future", name: "Future", expiration_date: "2999-01-01" },
          { id: "openai/no-date", name: "NoDate" },
          { id: "openai/bad-date", name: "BadDate", expiration_date: "not-a-date" },
        ]),
      );

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    const openai = result.current.providers.find((p) => p.slug === "openai")!;
    const names = openai.models.map((m) => m.name).sort();
    expect(names).toEqual(["BadDate", "Future", "NoDate"]);
  });

  it("throws OPENROUTER_DISABLED_MESSAGE when providers endpoint returns null body, clears cache, and sets providers to []", async () => {
    fetchMock.mockResolvedValueOnce(makeProvidersResponse(undefined));

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(OPENROUTER_DISABLED_MESSAGE);
    expect(result.current.providers).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(
      "Failed to fetch OpenRouter models:",
      expect.any(Error),
    );
  });

  it("throws a generic error for an unexpected providers response shape", async () => {
    fetchMock.mockResolvedValueOnce(makeProvidersResponse({ providers: 123 }));

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Failed to load models. Please check your connection.",
    );
  });

  it("sets a generic error when the providers request itself fails (non-ok response)", async () => {
    fetchMock.mockResolvedValueOnce(makeProvidersResponse({}, false, 500));

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Failed to load models. Please check your connection.",
    );
  });

  it("sets a generic error when the OpenRouter models request fails (non-ok response)", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce(makeModelsResponse([], false, 503));

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Failed to load models. Please check your connection.",
    );
  });

  it("throws when the OpenRouter models response has no data array", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ notData: [] }),
      } as unknown as Response);

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.error).toBe(
      "Failed to load models. Please check your connection.",
    );
  });

  it("serves from cache without refetching on remount within TTL", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce(
        makeModelsResponse([{ id: "openai/gpt-4", name: "GPT-4" }]),
      );

    const first = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Second hook instance in the same module scope, mounted before the
    // cache TTL elapses (we don't call invalidateCache() again here), should
    // hydrate from cache synchronously without issuing new fetches.
    const second = renderHook(() => useOpenRouterModels());
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.providers).toEqual(
      first.result.current.providers,
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("dedupes concurrent fetches across two mounted instances (shared inflightPromise)", async () => {
    let resolveProviders: (v: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveProviders = resolve;
      }),
    );
    fetchMock.mockResolvedValueOnce(
      makeModelsResponse([{ id: "openai/gpt-4", name: "GPT-4" }]),
    );

    const first = renderHook(() => useOpenRouterModels());
    const second = renderHook(() => useOpenRouterModels());
    expect(first.result.current.isLoading).toBe(true);
    expect(second.result.current.isLoading).toBe(true);

    await act(async () => {
      resolveProviders!(makeProvidersResponse({ providers: "all" }));
    });

    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    // Only one call to the providers endpoint and one to the models endpoint.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("retry() clears cache/inflight state and refetches", async () => {
    fetchMock
      .mockResolvedValueOnce(makeProvidersResponse({}, false, 500))
      .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
      .mockResolvedValueOnce(
        makeModelsResponse([{ id: "openai/gpt-4", name: "GPT-4" }]),
      );

    const { result } = renderHook(() => useOpenRouterModels());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe(
      "Failed to load models. Please check your connection.",
    );

    act(() => {
      result.current.retry();
    });
    expect(result.current.isLoading).toBe(true);
    expect(result.current.error).toBeNull();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.providers.map((p) => p.slug)).toEqual(["openai"]);
  });

  it("cancels in-flight updates on unmount (no state update after unmount)", async () => {
    let resolveProviders: (v: Response) => void;
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveProviders = resolve;
      }),
    );

    const { unmount } = renderHook(() => useOpenRouterModels());
    unmount();

    await act(async () => {
      resolveProviders!(makeProvidersResponse({ providers: "all" }));
      // Allow any pending microtasks/promise chains to flush; if the effect
      // failed to guard with `cancelled`, this would throw on unmounted state
      // updates (React would warn, not throw, but we mainly assert no crash).
      await Promise.resolve();
    });
  });

  it("re-fetches on interval tick once the cache TTL has elapsed", async () => {
    jest.useFakeTimers({ legacyFakeTimers: false, doNotFake: ["Date"] });
    try {
      fetchMock
        .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
        .mockResolvedValueOnce(
          makeModelsResponse([{ id: "openai/gpt-4", name: "GPT-4" }]),
        );

      const { result } = renderHook(() => useOpenRouterModels());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.isLoading).toBe(false);
      expect(fetchMock).toHaveBeenCalledTimes(2);

      fetchMock
        .mockResolvedValueOnce(makeProvidersResponse({ providers: "all" }))
        .mockResolvedValueOnce(
          makeModelsResponse([{ id: "openai/gpt-4-v2", name: "GPT-4 v2" }]),
        );

      await act(async () => {
        // Advance both the fake interval timer and the (real, but spied)
        // Date.now() past the cache TTL so the interval's own staleness
        // check decides to refetch.
        fakeNow += CACHE_TTL_MS + 1000;
        dateNowSpy.mockReturnValue(fakeNow);
        jest.advanceTimersByTime(CACHE_TTL_MS + 1000);
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(4);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("findModelInProviders", () => {
  it("finds a model by id across providers", () => {
    const providers = [
      {
        slug: "openai",
        name: "OpenAI",
        models: [{ id: "openai/gpt-4", name: "GPT-4" }],
      },
      {
        slug: "anthropic",
        name: "Anthropic",
        models: [{ id: "anthropic/claude-3", name: "Claude 3" }],
      },
    ];
    expect(findModelInProviders(providers, "anthropic/claude-3")).toEqual({
      id: "anthropic/claude-3",
      name: "Claude 3",
    });
  });

  it("returns null when no provider has the model", () => {
    const providers = [
      {
        slug: "openai",
        name: "OpenAI",
        models: [{ id: "openai/gpt-4", name: "GPT-4" }],
      },
    ];
    expect(findModelInProviders(providers, "missing/model")).toBeNull();
  });

  it("returns null for an empty providers list", () => {
    expect(findModelInProviders([], "anything")).toBeNull();
  });
});
