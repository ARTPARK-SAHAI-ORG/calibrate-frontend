import { renderHook, waitFor } from "@testing-library/react";
import {
  getOrgLimits,
  useUsesOwnProviderKeys,
  useUsesOwnProviderKeysIfKnown,
  clearOrgLimitsCache,
} from "@/hooks/useOrgLimits";
import { apiGet } from "@/lib/api";
import { ACTIVE_ORG_UUID_KEY } from "@/lib/orgs";

jest.mock("../../lib/api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  __esModule: true,
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

const mockApiGet = apiGet as jest.Mock;

// The module caches one request per token and workspace, so each test uses its
// own token to observe its own fetch.
describe("useUsesOwnProviderKeys", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    localStorage.clear();
  });

  it("is false until the backend says the workspace uses its own keys", async () => {
    mockApiGet.mockResolvedValue({ uses_own_provider_keys: true });
    localStorage.setItem("access_token", "token-own-keys");

    const { result } = renderHook(() => useUsesOwnProviderKeys());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/org-limits/me", "token-own-keys");
  });

  it("stays false when the request fails", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    localStorage.setItem("access_token", "token-fail");

    const { result } = renderHook(() => useUsesOwnProviderKeys());
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    expect(result.current).toBe(false);
  });

  it("does not fetch when there is no access token", () => {
    const { result } = renderHook(() => useUsesOwnProviderKeys());
    expect(result.current).toBe(false);
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("shares one request across hook instances with the same token", async () => {
    mockApiGet.mockResolvedValue({ uses_own_provider_keys: true });
    localStorage.setItem("access_token", "token-shared");

    const first = renderHook(() => useUsesOwnProviderKeys());
    const second = renderHook(() => useUsesOwnProviderKeys());
    await waitFor(() => expect(first.result.current).toBe(true));
    await waitFor(() => expect(second.result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });
});

describe("useUsesOwnProviderKeysIfKnown", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    localStorage.clear();
  });

  it("is null until the backend answers, then its answer", async () => {
    mockApiGet.mockResolvedValue({ uses_own_provider_keys: false });
    localStorage.setItem("access_token", "token-if-known");
    const { result } = renderHook(() => useUsesOwnProviderKeysIfKnown());
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(false));
  });

  it("stays null when the request fails", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    localStorage.setItem("access_token", "token-if-known-fail");
    const { result } = renderHook(() => useUsesOwnProviderKeysIfKnown());
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBeNull();
  });
});

describe("getOrgLimits", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
  });

  it("asks again for a different workspace", async () => {
    mockApiGet.mockResolvedValue({ uses_own_provider_keys: false });
    localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-a");
    await getOrgLimits("token-orgs");
    await getOrgLimits("token-orgs");
    expect(mockApiGet).toHaveBeenCalledTimes(1);
    localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-b");
    await getOrgLimits("token-orgs");
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it("asks again after the cache is cleared", async () => {
    mockApiGet.mockResolvedValue({ uses_own_provider_keys: false });
    await expect(getOrgLimits("token-clear")).resolves.toEqual({
      uses_own_provider_keys: false,
      max_chat_replies_per_day: 200,
      max_knowledge_base_chars: null,
    });
    clearOrgLimitsCache();
    mockApiGet.mockResolvedValue({
      uses_own_provider_keys: true,
      max_chat_replies_per_day: null,
      max_knowledge_base_chars: 5000,
    });
    await expect(getOrgLimits("token-clear")).resolves.toEqual({
      uses_own_provider_keys: true,
      max_chat_replies_per_day: null,
      max_knowledge_base_chars: 5000,
    });
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });
});
