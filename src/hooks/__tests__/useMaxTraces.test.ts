import { renderHook, waitFor } from "@testing-library/react";
import { useMaxTraces } from "@/hooks/useMaxTraces";
import { apiGet } from "@/lib/api";
import { LIMITS } from "@/constants/limits";

jest.mock("../../lib/api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  __esModule: true,
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

const mockApiGet = apiGet as jest.Mock;

// useMaxTraces keeps a module-level cache keyed by access token (same pattern
// as useMaxRowsPerEval). A distinct token per test sidesteps that cache so
// each test observes its own fetch.
describe("useMaxTraces", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    localStorage.clear();
  });

  it("starts at the default cap before the request resolves", () => {
    mockApiGet.mockReturnValue(new Promise(() => {}));
    localStorage.setItem("access_token", "mt-pending");

    const { result } = renderHook(() => useMaxTraces());
    expect(result.current).toBe(LIMITS.DEFAULT_MAX_TRACES);
  });

  it("updates to the fetched value once the request resolves", async () => {
    mockApiGet.mockResolvedValue({ max_traces: 123456 });
    localStorage.setItem("access_token", "mt-b");

    const { result } = renderHook(() => useMaxTraces());
    await waitFor(() => expect(result.current).toBe(123456));
    expect(mockApiGet).toHaveBeenCalledWith("/org-limits/me/max-traces", "mt-b");
  });

  it("falls back to the default when max_traces is null", async () => {
    mockApiGet.mockResolvedValue({ max_traces: null });
    localStorage.setItem("access_token", "mt-c");

    const { result } = renderHook(() => useMaxTraces());
    await waitFor(() =>
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_TRACES),
    );
  });

  it("falls back to the default when the request rejects", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    localStorage.setItem("access_token", "mt-d");

    const { result } = renderHook(() => useMaxTraces());
    await waitFor(() =>
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_TRACES),
    );
  });

  it("does not fetch without an access token", async () => {
    const { result } = renderHook(() => useMaxTraces());
    await waitFor(() =>
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_TRACES),
    );
    expect(mockApiGet).not.toHaveBeenCalled();
  });
});
