import { act, renderHook, waitFor } from "@testing-library/react";
import {
  useEnabledProviders,
  isProviderEnabled,
  clearEnabledProvidersCache,
} from "@/hooks/useEnabledProviders";
import { ACTIVE_ORG_UUID_KEY } from "@/lib/orgs";

// Relative specifiers (not the "@/" alias): next/jest's SWC transform only
// rewrites "@/..." inside import/export declarations, and jest mocks are keyed
// by resolved absolute path — this still intercepts the hook's imports.
jest.mock("../../lib/api", () => ({
  getBackendUrl: jest.fn(() => "https://backend.example.com"),
  getDefaultHeaders: jest.fn(() => ({ accept: "application/json" })),
}));

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const mockToken = jest.fn<string | null, []>(() => "token-default");
jest.mock("../useAccessToken", () => ({
  useAccessToken: () => mockToken(),
}));

function providersResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  } as Response;
}

describe("isProviderEnabled", () => {
  it("returns true for a null (fail-open) set regardless of value", () => {
    expect(isProviderEnabled(null, "deepgram")).toBe(true);
  });

  it("matches values case-insensitively against the set", () => {
    const enabled = new Set(["deepgram", "openai"]);
    expect(isProviderEnabled(enabled, "OpenAI")).toBe(true);
    expect(isProviderEnabled(enabled, "GEMINI")).toBe(false);
  });
});

describe("useEnabledProviders", () => {
  // A unique token per test guarantees a cache miss (the module cache is keyed
  // by token), so each test starts as if the cache were empty.
  let tokenCounter = 0;
  beforeEach(() => {
    jest.clearAllMocks();
    tokenCounter += 1;
    mockToken.mockReturnValue(`token-${tokenCounter}`);
  });

  it("returns a lowercased set of enabled providers on success", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        providersResponse({ providers: ["Deepgram", "OpenAI", "google"] }),
      ) as unknown as typeof fetch;

    const { result } = renderHook(() => useEnabledProviders());

    await waitFor(() => expect(result.current).not.toBeNull());
    expect([...(result.current as Set<string>)].sort()).toEqual([
      "deepgram",
      "google",
      "openai",
    ]);
  });

  it("fails open (null) on a non-ok response", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        providersResponse(null, false, 500),
      ) as unknown as typeof fetch;

    const { result } = renderHook(() => useEnabledProviders());

    // stays null; give the effect a tick to settle
    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalled(),
    );
    expect(result.current).toBeNull();
  });

  it("fails open (null) on an empty provider list", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        providersResponse({ providers: [] }),
      ) as unknown as typeof fetch;

    const { result } = renderHook(() => useEnabledProviders());

    await waitFor(() =>
      expect(global.fetch as jest.Mock).toHaveBeenCalled(),
    );
    expect(result.current).toBeNull();
  });

  it("does not fetch when there is no access token", async () => {
    mockToken.mockReturnValue(null);
    global.fetch = jest.fn() as unknown as typeof fetch;

    const { result } = renderHook(() => useEnabledProviders());

    expect(result.current).toBeNull();
    expect(global.fetch as jest.Mock).not.toHaveBeenCalled();
  });

  it("asks again for another workspace and after the stored list is cleared", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue(
        providersResponse({ providers: ["openai"] }),
      ) as unknown as typeof fetch;
    const fetchMock = global.fetch as jest.Mock;

    localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-a");
    const first = renderHook(() => useEnabledProviders());
    await waitFor(() => expect(first.result.current).not.toBeNull());
    const second = renderHook(() => useEnabledProviders());
    await waitFor(() => expect(second.result.current).not.toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);

    localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-b");
    const third = renderHook(() => useEnabledProviders());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(third.result.current).not.toBeNull());

    clearEnabledProvidersCache();
    renderHook(() => useEnabledProviders());
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    localStorage.removeItem(ACTIVE_ORG_UUID_KEY);
  });
  it("re-reads the list in a mounted hook when the stored list is cleared", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(providersResponse({ providers: ["openai"] }))
      .mockResolvedValueOnce(
        providersResponse({ providers: ["openai", "deepgram"] }),
      ) as unknown as typeof fetch;

    const { result, unmount } = renderHook(() => useEnabledProviders());
    await waitFor(() => expect(result.current).not.toBeNull());
    expect([...(result.current as Set<string>)]).toEqual(["openai"]);

    act(() => clearEnabledProvidersCache());
    await waitFor(() =>
      expect([...(result.current as Set<string>)].sort()).toEqual([
        "deepgram",
        "openai",
      ]),
    );
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2);

    unmount();
    clearEnabledProvidersCache();
    expect(global.fetch as jest.Mock).toHaveBeenCalledTimes(2);
  });
});
