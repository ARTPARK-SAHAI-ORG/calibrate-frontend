import { renderHook, waitFor } from "@testing-library/react";
import {
  useEnabledProviders,
  isProviderEnabled,
} from "@/hooks/useEnabledProviders";

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
});
