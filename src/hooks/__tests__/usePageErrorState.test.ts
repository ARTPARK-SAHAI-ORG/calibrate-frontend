import { renderHook, act } from "@testing-library/react";
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

describe("usePageErrorState", () => {
  beforeEach(() => {
    mockSignOut.mockReset();
    mockGetErrorStatusCode.mockReset();
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
