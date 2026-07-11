import { renderHook, waitFor } from "@testing-library/react";
import { useMaxRowsPerEval } from "@/hooks/useMaxRowsPerEval";
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

// useMaxRowsPerEval keeps a module-level cache (cachedPromise/cachedToken)
// shared across all hook instances within the same access token. Using a
// distinct token per test sidesteps that cache so each test observes its
// own fetch.
describe("useMaxRowsPerEval", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    localStorage.clear();
  });

  it("starts at the default max rows before the request resolves", () => {
    mockApiGet.mockReturnValue(new Promise(() => {})); // never resolves
    localStorage.setItem("access_token", "token-pending");

    const { result } = renderHook(() => useMaxRowsPerEval());
    expect(result.current).toBe(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL);
  });

  it("updates to the fetched value once the request resolves", async () => {
    mockApiGet.mockResolvedValue({ max_rows_per_eval: 42 });
    localStorage.setItem("access_token", "token-b");

    const { result } = renderHook(() => useMaxRowsPerEval());
    await waitFor(() => expect(result.current).toBe(42));
    expect(mockApiGet).toHaveBeenCalledWith(
      "/org-limits/me/max-rows-per-eval",
      "token-b",
    );
  });

  it("falls back to the default when max_rows_per_eval is null", async () => {
    mockApiGet.mockResolvedValue({ max_rows_per_eval: null });
    localStorage.setItem("access_token", "token-c");

    const { result } = renderHook(() => useMaxRowsPerEval());
    await waitFor(() =>
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL),
    );
  });

  it("falls back to the default when the request rejects", async () => {
    mockApiGet.mockRejectedValue(new Error("network error"));
    localStorage.setItem("access_token", "token-d");

    const { result } = renderHook(() => useMaxRowsPerEval());
    await waitFor(() =>
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL),
    );
  });

  it("does not fetch when there is no access token", async () => {
    // No access_token in localStorage -> useAccessToken resolves to null.
    const { result } = renderHook(() => useMaxRowsPerEval());

    await waitFor(() => {
      expect(result.current).toBe(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL);
    });
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("shares a single cached request across multiple hook instances with the same token", async () => {
    mockApiGet.mockResolvedValue({ max_rows_per_eval: 77 });
    localStorage.setItem("access_token", "token-shared");

    const first = renderHook(() => useMaxRowsPerEval());
    const second = renderHook(() => useMaxRowsPerEval());

    await waitFor(() => expect(first.result.current).toBe(77));
    await waitFor(() => expect(second.result.current).toBe(77));

    expect(mockApiGet).toHaveBeenCalledTimes(1);
  });

  it("cleans up on unmount before the fetch resolves without throwing", async () => {
    let resolvePromise: (value: { max_rows_per_eval: number }) => void;
    const pending = new Promise<{ max_rows_per_eval: number }>((resolve) => {
      resolvePromise = resolve;
    });
    mockApiGet.mockReturnValue(pending);
    localStorage.setItem("access_token", "token-unmount");

    const { unmount } = renderHook(() => useMaxRowsPerEval());
    unmount();

    resolvePromise!({ max_rows_per_eval: 99 });
    await pending;
  });
});
