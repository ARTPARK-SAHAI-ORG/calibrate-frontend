import { renderHook, act, waitFor } from "@testing-library/react";
import { signOut } from "next-auth/react";
import { usePageErrorState } from "@/hooks/usePageErrorState";

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

/** Workspace ids are always uuids, so the tests use uuid-shaped ones. */
const ORG_A = "11111111-1111-4111-8111-111111111111";
const ORG_B = "22222222-2222-4222-8222-222222222222";

const replace = jest.fn();

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
    value: {
      ...window.location,
      pathname: `/${ORG_A}/agents/agent-1`,
      search: "",
      hash: "",
      replace,
    },
  });
});

describe("usePageErrorState", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockGetErrorStatusCode.mockReset();
    replace.mockClear();
    window.location.pathname = `/${ORG_A}/agents/agent-1`;
    window.localStorage.clear();
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
        handled = result.current.captureError(
          new Error("Request failed: 403 - nope"),
        );
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(403);
    });

    it("sets errorCode 404 and returns true", () => {
      mockGetErrorStatusCode.mockReturnValue(404);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(
          new Error("Request failed: 404 - nope"),
        );
      });

      expect(handled).toBe(true);
      expect(result.current.errorCode).toBe(404);
    });

    it("returns false and leaves errorCode null for other statuses", () => {
      mockGetErrorStatusCode.mockReturnValue(500);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(
          new Error("Request failed: 500 - oops"),
        );
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
    it("opens the page under the workspace the 404 names", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse(
          notFoundWith({ detail: "Agent not found", organization_uuid: ORG_B }),
        );
      });

      // Shows the spinner, not "Not Found", while the body is being read.
      expect(result.current.errorCode).toBe("switching");

      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(`/${ORG_B}/agents/agent-1`),
      );
      expect(result.current.errorCode).toBe("switching");
    });

    it("shows Not Found when the 404 names no workspace", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse(
          notFoundWith({ detail: "Agent not found" }),
        );
      });

      await waitFor(() => expect(result.current.errorCode).toBe(404));
      expect(replace).not.toHaveBeenCalled();
    });

    it("shows Not Found when the 404 names the workspace already on screen", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse(
          notFoundWith({ detail: "Agent not found", organization_uuid: ORG_A }),
        );
      });

      await waitFor(() => expect(result.current.errorCode).toBe(404));
      expect(replace).not.toHaveBeenCalled();
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
      expect(replace).not.toHaveBeenCalled();
    });

    it("opens the page under the workspace a 403 names", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse({
          status: 403,
          clone: () => ({ json: async () => ({ organization_uuid: ORG_B }) }),
        } as unknown as Response);
      });

      expect(result.current.errorCode).toBe("switching");
      await waitFor(() =>
        expect(replace).toHaveBeenCalledWith(`/${ORG_B}/agents/agent-1`),
      );
    });

    it("says no access when a 403 names no workspace", async () => {
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureResponse({
          status: 403,
          clone: () => ({ json: async () => ({ detail: "Forbidden" }) }),
        } as unknown as Response);
      });

      await waitFor(() => expect(result.current.errorCode).toBe(403));
      expect(replace).not.toHaveBeenCalled();
    });

    it("switches on an apiClient 403 that names a workspace", () => {
      mockGetErrorStatusCode.mockReturnValue(403);
      const { result } = renderHook(() => usePageErrorState());

      act(() => {
        result.current.captureError(
          new Error(
            `Request failed: 403 - {"detail":"Forbidden","organization_uuid":"${ORG_B}"}`,
          ),
        );
      });

      expect(replace).toHaveBeenCalledWith(`/${ORG_B}/agents/agent-1`);
      expect(result.current.errorCode).toBe("switching");
    });

    it("switches on an apiClient 404 that names a workspace", () => {
      mockGetErrorStatusCode.mockReturnValue(404);
      const { result } = renderHook(() => usePageErrorState());

      let handled: boolean | undefined;
      act(() => {
        handled = result.current.captureError(
          new Error(
            `Request failed: 404 - {"detail":"Task not found","organization_uuid":"${ORG_B}"}`,
          ),
        );
      });

      expect(handled).toBe(true);
      expect(replace).toHaveBeenCalledWith(`/${ORG_B}/agents/agent-1`);
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
      expect(replace).not.toHaveBeenCalled();
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
