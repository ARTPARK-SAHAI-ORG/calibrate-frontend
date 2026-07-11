import { renderHook, waitFor } from "@testing-library/react";
import { useSession } from "next-auth/react";
import { useAccessToken, useAuth } from "@/hooks/useAccessToken";

jest.mock("next-auth/react", () => ({
  __esModule: true,
  useSession: jest.fn(),
}));

const mockUseSession = useSession as jest.Mock;

describe("useAccessToken", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReset();
  });

  it("returns null while session status is loading", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    const { result } = renderHook(() => useAccessToken());
    expect(result.current).toBeNull();
  });

  it("returns the session backendAccessToken when present", async () => {
    mockUseSession.mockReturnValue({
      data: { backendAccessToken: "session-token" },
      status: "authenticated",
    });
    const { result } = renderHook(() => useAccessToken());
    await waitFor(() => expect(result.current).toBe("session-token"));
  });

  it("falls back to localStorage token when no session token", async () => {
    localStorage.setItem("access_token", "local-token");
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useAccessToken());
    await waitFor(() => expect(result.current).toBe("local-token"));
  });

  it("returns null when neither session nor localStorage has a token", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useAccessToken());
    await waitFor(() => expect(result.current).toBeNull());
  });
});

describe("useAuth", () => {
  beforeEach(() => {
    localStorage.clear();
    mockUseSession.mockReset();
  });

  it("is loading while session status is loading, even before local check", () => {
    mockUseSession.mockReturnValue({ data: null, status: "loading" });
    const { result } = renderHook(() => useAuth());
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.accessToken).toBeNull();
  });

  it("is loading until localStorage check completes, then reflects auth state", async () => {
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.accessToken).toBeNull();
  });

  it("reports authenticated with session token", async () => {
    mockUseSession.mockReturnValue({
      data: { backendAccessToken: "session-token" },
      status: "authenticated",
    });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe("session-token");
  });

  it("reports authenticated with localStorage token when no session token", async () => {
    localStorage.setItem("access_token", "local-token");
    mockUseSession.mockReturnValue({ data: null, status: "unauthenticated" });
    const { result } = renderHook(() => useAuth());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.accessToken).toBe("local-token");
  });
});
