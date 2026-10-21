import { renderHook, waitFor } from "@testing-library/react";
import { useIsSuperadmin } from "@/hooks/useIsSuperadmin";
import { apiGet } from "@/lib/api";

jest.mock("../../lib/api", () => ({
  __esModule: true,
  apiGet: jest.fn(),
}));

jest.mock("next-auth/react", () => ({
  __esModule: true,
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

const mockApiGet = apiGet as jest.Mock;

// The hook caches per token, so each test uses its own token.
describe("useIsSuperadmin", () => {
  beforeEach(() => {
    mockApiGet.mockReset();
    localStorage.clear();
  });

  it("is true when the backend says so", async () => {
    mockApiGet.mockResolvedValue({ is_superadmin: true });
    localStorage.setItem("access_token", "token-yes");
    const { result } = renderHook(() => useIsSuperadmin());
    expect(result.current).toBe(false);
    await waitFor(() => expect(result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledWith("/admin/access", "token-yes");
  });

  it("is false when the backend says no", async () => {
    mockApiGet.mockResolvedValue({ is_superadmin: false });
    localStorage.setItem("access_token", "token-no");
    const { result } = renderHook(() => useIsSuperadmin());
    await waitFor(() => expect(mockApiGet).toHaveBeenCalled());
    await Promise.resolve();
    expect(result.current).toBe(false);
  });

  it("is false when the request fails, and asks again next time", async () => {
    mockApiGet.mockRejectedValueOnce(new Error("boom"));
    localStorage.setItem("access_token", "token-err");
    const first = renderHook(() => useIsSuperadmin());
    await waitFor(() => expect(mockApiGet).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(first.result.current).toBe(false);

    mockApiGet.mockResolvedValueOnce({ is_superadmin: true });
    const second = renderHook(() => useIsSuperadmin());
    await waitFor(() => expect(second.result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledTimes(2);
  });

  it("asks once per token across every caller", async () => {
    mockApiGet.mockResolvedValue({ is_superadmin: true });
    localStorage.setItem("access_token", "token-shared");
    const a = renderHook(() => useIsSuperadmin());
    const b = renderHook(() => useIsSuperadmin());
    await waitFor(() => expect(a.result.current).toBe(true));
    await waitFor(() => expect(b.result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledTimes(1);

    localStorage.setItem("access_token", "token-other");
    const c = renderHook(() => useIsSuperadmin());
    await waitFor(() => expect(c.result.current).toBe(true));
    expect(mockApiGet).toHaveBeenCalledTimes(2);
    expect(mockApiGet).toHaveBeenLastCalledWith("/admin/access", "token-other");
  });
});
