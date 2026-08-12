import { renderHook, act, waitFor } from "@testing-library/react";
import { signOut } from "next-auth/react";
import { usePageErrorState } from "@/hooks/usePageErrorState";
import { ACTIVE_ORG_UUID_KEY } from "@/lib/orgs";

jest.mock("next-auth/react", () => ({
  __esModule: true,
  signOut: jest.fn(),
}));

jest.mock("../../lib/parseBackendError", () => ({
  __esModule: true,
  getErrorStatusCode: jest.fn(),
}));

import { getErrorStatusCode } from "@/lib/parseBackendError";

const mockSignOut = signOut as jest.Mock;
const mockGetErrorStatusCode = getErrorStatusCode as jest.Mock;

const reload = jest.fn();

/** A 404 whose body is readable, like a real `fetch` response. */
function notFoundWith(body: unknown): Response {
  return {
    status: 404,
    clone: () => ({ json: async () => body }),
  } as unknown as Response;
}

beforeAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, pathname: "/agents/agent-1", reload },
  });
});

describe("usePageErrorState", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockGetErrorStatusCode.mockReset();
    reload.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("initializes with a null errorCode", () => {
    const { result } = renderHook(() => usePageErrorState());
    expect(result.current.errorCode).toBeNull();
  });

  describe("captureResponse", () => {
    it("signs the user out on a 401 and returns true", () => {
      const { result } = renderHook(() => usePageErrorState());
      const response = { status: 401 } as Response;

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureResponse(response);
      });

      expect(handled).toBe(true);
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
      expect(result.current.errorCode).toBeNull();
    });

    it("sets errorCode 403 and returns true", () => {
      const { result } = renderHook(() => usePageErrorState());
      const response = { status: 403 } as Response;

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureResponse(response);
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(403);
    });

    it("sets errorCode 404 and returns true", () => {
      const { result } = renderHook(() => usePageErrorState());
      const response = { status: 404 } as Response;

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureResponse(response);
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(404);
    });

    it("returns false and leaves errorCode null for other statuses", () => {
      const { result } = renderHook(() => usePageErrorState());
      const response = { status: 500 } as Response;

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureResponse(response);
      });

      expect(handled).toBe(false);
      expect(result.current.errorCode).toBeNull();
      expect(mockSignOut).not.toHaveBeenCalled();
    });
  });

  describe("captureError", () => {
    it("sets errorCode 403 and returns true", () => {
      mockGetErrorStatusCode.mockReturnValue(403);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(new Error("Request failed: 403 - nope"));
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(403);
    });

    it("sets errorCode 404 and returns true", () => {
      mockGetErrorStatusCode.mockReturnValue(404);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(new Error("Request failed: 404 - nope"));
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(404);
    });

    it("returns false and leaves errorCode null for other statuses", () => {
      mockGetErrorStatusCode.mockReturnValue(500);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(new Error("Request failed: 500 - oops"));
      });

      expect(handled).toBe(false);
      expect(result.current.errorCode).toBeNull();
    });

    it("returns false when getErrorStatusCode returns null", () => {
      mockGetErrorStatusCode.mockReturnValue(null);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(new Error("network failure"));
      });

      expect(handled).toBe(false);
      expect(result.current.errorCode).toBeNull();
    });
  });

  describe("a link that belongs to another workspace", () => {
    it("switches workspace and reloads when the 404 names one", async () => {
      window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse(
          notFoundWith({ detail: "Agent not found", organization_uuid: "org-other" }),
        );
      });

      // Shows the spinner, not "Not Found", while the body is being read.
      expect(result.current.errorCode).toBe("switching");

      await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
      expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe("org-other");
      expect(result.current.errorCode).toBe("switching");
    });

    it("shows Not Found when the 404 names no workspace", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse(notFoundWith({ detail: "Agent not found" }));
      });

      await waitFor(() => expect(result.current.errorCode).toBe(404));
      expect(reload).not.toHaveBeenCalled();
    });

    it("shows Not Found when the 404 body cannot be read", async () => {
      const { result } = renderHook(() => usePageErrorState());
      const response = {
        status: 404,
        clone: () => ({
          json: async () => {
            throw new Error("not JSON");
          },
        }),
      } as unknown as Response;

      act(() => {
        result.current.captureResponse(response);
      });

      await waitFor(() => expect(result.current.errorCode).toBe(404));
      expect(reload).not.toHaveBeenCalled();
    });

    it("never switches on a 403", () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse({
          status: 403,
          clone: () => ({ json: async () => ({ organization_uuid: "org-other" }) }),
        } as unknown as Response);
      });

      expect(result.current.errorCode).toBe(403);
      expect(reload).not.toHaveBeenCalled();
    });

    it("switches on an apiClient 404 that names a workspace", () => {
      window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-current");
      mockGetErrorStatusCode.mockReturnValue(404);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(
          new Error(
            'Request failed: 404 - {"detail":"Task not found","organization_uuid":"org-other"}',
          ),
        );
      });

      expect(handled).toBe(true);
      expect(window.localStorage.getItem(ACTIVE_ORG_UUID_KEY)).toBe("org-other");
      expect(reload).toHaveBeenCalledTimes(1);
      expect(result.current.errorCode).toBe("switching");
    });

    it("shows Not Found when an apiClient 404 names no workspace", () => {
      mockGetErrorStatusCode.mockReturnValue(404);
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureError(
          new Error('Request failed: 404 - {"detail":"Task not found"}'),
        );
      });

      expect(result.current.errorCode).toBe(404);
      expect(reload).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("clears a previously set errorCode", () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse({ status: 404 } as Response);
      });
      expect(result.current.errorCode).toBe(404);

      act(() => {
        result.current.reset();
      });
      expect(result.current.errorCode).toBeNull();
    });
  });
});
