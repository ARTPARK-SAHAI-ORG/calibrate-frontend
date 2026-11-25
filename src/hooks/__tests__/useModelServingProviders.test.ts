import { renderHook, waitFor } from "@testing-library/react";
import { useModelServingProviders } from "@/hooks/useModelServingProviders";
import { clearAllRequestCaches } from "@/lib/requestCache";
import { reportError } from "@/lib/reportError";

// Relative specifier, not the "@/" alias: next/jest's SWC transform only
// rewrites "@/..." inside import/export declarations, not jest.mock()'s
// string argument. Mocks are keyed by resolved path, so this still
// intercepts the hook's "@/lib/reportError" import.
jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

type Endpoint = {
  provider_name?: unknown;
  tag?: unknown;
  status?: unknown;
  pricing?: { prompt?: unknown };
};

function endpointsResponse(endpoints: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({ data: { endpoints } }),
  } as Response;
}

const MODEL = "deepseek/deepseek-chat-v3.1";

describe("useModelServingProviders", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    clearAllRequestCaches();
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  it("asks for nothing when there is no model", async () => {
    const { result } = renderHook(() => useModelServingProviders(null));
    expect(result.current.providers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    const empty = renderHook(() => useModelServingProviders(""));
    expect(empty.result.current.providers).toEqual([]);
    expect(empty.result.current.isLoading).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lists the companies cheapest first and drops a deranked one", async () => {
    const endpoints: Endpoint[] = [
      {
        provider_name: "Novita",
        tag: "novita/fp8",
        status: 0,
        pricing: { prompt: "0.00000075" },
      },
      {
        provider_name: "DeepInfra",
        tag: "deepinfra/fp4",
        status: 0,
        pricing: { prompt: "0.00000025" },
      },
      {
        provider_name: "Google Vertex",
        tag: "google-vertex/us-west2",
        status: -5,
        pricing: { prompt: "0.00000001" },
      },
      // No tag, and a tag that is not a string: both skipped.
      { provider_name: "No Tag", status: 0, pricing: { prompt: "0.000000001" } },
      { provider_name: "Bad Tag", tag: 7, status: 0 },
    ];
    fetchMock.mockResolvedValueOnce(endpointsResponse(endpoints));

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
      { slug: "novita", name: "Novita", pricePerMillionInput: 0.75 },
    ]);

    expect(fetchMock).toHaveBeenCalledWith(
      `https://openrouter.ai/api/v1/models/${MODEL}/endpoints`,
    );
  });

  it("keeps the cheaper of two offers from the same company", async () => {
    fetchMock.mockResolvedValueOnce(
      endpointsResponse([
        {
          provider_name: "DeepInfra",
          tag: "deepinfra/fp8",
          status: 0,
          pricing: { prompt: "0.00000090" },
        },
        {
          provider_name: "DeepInfra",
          tag: "deepinfra/fp4",
          status: 0,
          pricing: { prompt: "0.00000025" },
        },
      ]),
    );

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([
      { slug: "deepinfra", name: "DeepInfra", pricePerMillionInput: 0.25 },
    ]);
  });

  it("puts a company with no readable price last and names it after its slug", async () => {
    fetchMock.mockResolvedValueOnce(
      endpointsResponse([
        // A status that is not a number is kept: only a negative one is dropped.
        { tag: "mystery", status: "ok", pricing: { prompt: "not-a-number" } },
        { provider_name: "", tag: "quiet/one", status: 0 },
        {
          provider_name: "Novita",
          tag: "novita/fp8",
          status: 0,
          pricing: { prompt: "0.00000075" },
        },
        // Two with no price at all: ordered by name between themselves.
        { provider_name: "Alpha", tag: "alpha/x", status: 0, pricing: {} },
        // A tag with no company in front of the slash is skipped.
        { provider_name: "Orphan", tag: "/orphan", status: 0 },
        "not an object",
        null,
      ]),
    );

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([
      { slug: "novita", name: "Novita", pricePerMillionInput: 0.75 },
      { slug: "alpha", name: "Alpha", pricePerMillionInput: null },
      { slug: "mystery", name: "mystery", pricePerMillionInput: null },
      { slug: "quiet", name: "quiet", pricePerMillionInput: null },
    ]);
  });

  it("breaks a price tie by name", async () => {
    fetchMock.mockResolvedValueOnce(
      endpointsResponse([
        {
          provider_name: "Zeta",
          tag: "zeta/a",
          status: 0,
          pricing: { prompt: "0.0000005" },
        },
        {
          provider_name: "Beta",
          tag: "beta/a",
          status: 0,
          pricing: { prompt: "0.0000005" },
        },
      ]),
    );

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers.map((p) => p.slug)).toEqual([
      "beta",
      "zeta",
    ]);
  });

  it("gives an empty list when the answer is not the shape it expects", async () => {
    fetchMock.mockResolvedValueOnce(endpointsResponse({ nope: true }));

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([]);
  });

  it("gives an empty list and reports a failed request", async () => {
    fetchMock.mockResolvedValueOnce(endpointsResponse([], false, 500));

    const { result } = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers).toEqual([]);
    expect(reportError).toHaveBeenCalledWith(
      "Failed to fetch model serving providers:",
      expect.any(Error),
    );
  });

  it("does nothing when a request fails after the window has closed", async () => {
    let rejectIt: (e: Error) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((_resolve, reject) => {
        rejectIt = reject;
      }),
    );

    const { unmount } = renderHook(() => useModelServingProviders(MODEL));
    unmount();
    rejectIt(new Error("gone"));

    await waitFor(() => expect(reportError).toHaveBeenCalled());
  });

  it("shows a list it already has without asking again", async () => {
    fetchMock.mockResolvedValueOnce(
      endpointsResponse([
        {
          provider_name: "DeepInfra",
          tag: "deepinfra/fp4",
          status: 0,
          pricing: { prompt: "0.00000025" },
        },
      ]),
    );

    const first = renderHook(() => useModelServingProviders(MODEL));
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    first.unmount();

    const second = renderHook(() => useModelServingProviders(MODEL));
    expect(second.result.current.isLoading).toBe(false);
    expect(second.result.current.providers).toEqual(
      first.result.current.providers,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops a late answer for a model the reader has moved away from", async () => {
    let resolveFirst: (v: Response) => void = () => {};
    fetchMock
      .mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
      )
      .mockResolvedValueOnce(
        endpointsResponse([
          {
            provider_name: "Novita",
            tag: "novita/fp8",
            status: 0,
            pricing: { prompt: "0.00000075" },
          },
        ]),
      );

    const { result, rerender } = renderHook(
      ({ model }: { model: string }) => useModelServingProviders(model),
      { initialProps: { model: MODEL } },
    );

    rerender({ model: "openai/gpt-4" });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.providers.map((p) => p.slug)).toEqual(["novita"]);

    resolveFirst(
      endpointsResponse([
        {
          provider_name: "DeepInfra",
          tag: "deepinfra/fp4",
          status: 0,
          pricing: { prompt: "0.00000025" },
        },
      ]),
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(result.current.providers.map((p) => p.slug)).toEqual(["novita"]);
  });

  it("empties the list when the model is taken away", async () => {
    fetchMock.mockResolvedValueOnce(
      endpointsResponse([
        {
          provider_name: "DeepInfra",
          tag: "deepinfra/fp4",
          status: 0,
          pricing: { prompt: "0.00000025" },
        },
      ]),
    );

    const { result, rerender } = renderHook(
      ({ model }: { model: string | null }) => useModelServingProviders(model),
      { initialProps: { model: MODEL as string | null } },
    );
    await waitFor(() => expect(result.current.providers).toHaveLength(1));

    rerender({ model: null });
    expect(result.current.providers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });
});
