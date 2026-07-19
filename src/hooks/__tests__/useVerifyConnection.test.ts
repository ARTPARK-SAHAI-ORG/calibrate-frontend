import { renderHook, act } from "@testing-library/react";
import { useVerifyConnection } from "@/hooks/useVerifyConnection";
import { signOut } from "next-auth/react";

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../useAccessToken", () => ({
  useAccessToken: jest.fn(() => "tok"),
}));

const mockSignOut = signOut as jest.Mock;

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("useVerifyConnection", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  let fetchMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://backend.example.com";
    fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  describe("verifySavedAgent", () => {
    it("throws and sets error when backend URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;

      const { result } = renderHook(() => useVerifyConnection());

      let success: boolean = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("BACKEND_URL not set");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.isVerifying).toBe(false);
    });

    it("returns true and clears errors on successful verification", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

      const { result } = renderHook(() => useVerifyConnection());

      let success = false;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        "https://backend.example.com/agents/agent-1/verify-connection",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer tok",
          }),
          body: JSON.stringify({}),
        })
      );
      expect(result.current.verifyError).toBeNull();
      expect(result.current.verifySampleResponse).toBeNull();
      expect(result.current.isVerifying).toBe(false);
    });

    it("passes messages in the body when provided", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      const messages = [{ role: "user", content: "hi" }];
      await act(async () => {
        await result.current.verifySavedAgent("agent-1", messages);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ messages }),
        })
      );
    });

    it("does not include empty messages array in body", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifySavedAgent("agent-1", []);
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({}),
        })
      );
    });

    it("returns false and sets error/sample_response on unsuccessful verification", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: false, error: "bad config", sample_response: { foo: "bar" } })
      );

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("bad config");
      expect(result.current.verifySampleResponse).toEqual({ foo: "bar" });
    });

    it("uses default error message and null sample when unsuccessful response omits them", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: false }));

      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifySavedAgent("agent-1");
      });

      expect(result.current.verifyError).toBe("Connection verification failed");
      expect(result.current.verifySampleResponse).toBeNull();
    });

    it("treats missing success field as failure", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("Connection verification failed");
    });

    it("signs out and returns false on 401", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
      mockSignOut.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });

    it("sets generic error when response is not ok (non-401)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("Verification request failed");
    });

    it("sets generic error when fetch rejects with a non-Error", async () => {
      fetchMock.mockRejectedValueOnce("network down");

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifySavedAgent("agent-1");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("Verification failed");
    });

    it("sets isVerifying true during the call", async () => {
      let resolveFetch: (v: Response) => void;
      fetchMock.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFetch = resolve;
        })
      );

      const { result } = renderHook(() => useVerifyConnection());

      let promise: Promise<boolean>;
      act(() => {
        promise = result.current.verifySavedAgent("agent-1");
      });

      expect(result.current.isVerifying).toBe(true);

      await act(async () => {
        resolveFetch(jsonResponse({ success: true }));
        await promise;
      });

      expect(result.current.isVerifying).toBe(false);
    });
  });

  describe("verifyAdHoc", () => {
    it("throws and sets error when backend URL is not set", async () => {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifyAdHoc("https://agent.example.com");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("BACKEND_URL not set");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("trims the agent URL and posts minimal body when no headers/messages", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifyAdHoc("  https://agent.example.com  ");
      });

      expect(fetchMock).toHaveBeenCalledWith(
        "https://backend.example.com/agents/verify-connection",
        expect.objectContaining({
          body: JSON.stringify({ agent_url: "https://agent.example.com" }),
        })
      );
    });

    it("includes agent_headers when provided and non-empty", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifyAdHoc("https://agent.example.com", {
          "X-Custom": "1",
        });
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            agent_url: "https://agent.example.com",
            agent_headers: { "X-Custom": "1" },
          }),
        })
      );
    });

    it("omits agent_headers when provided but empty", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifyAdHoc("https://agent.example.com", {});
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({ agent_url: "https://agent.example.com" }),
        })
      );
    });

    it("includes messages when provided and non-empty", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));
      const { result } = renderHook(() => useVerifyConnection());

      const messages = [{ role: "user", content: "hello" }];
      await act(async () => {
        await result.current.verifyAdHoc(
          "https://agent.example.com",
          undefined,
          messages
        );
      });

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: JSON.stringify({
            agent_url: "https://agent.example.com",
            messages,
          }),
        })
      );
    });

    it("returns false and sets error on unsuccessful verification", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: false, error: "invalid url" })
      );
      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifyAdHoc("https://agent.example.com");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("invalid url");
    });

    it("signs out and returns false on 401", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 401));
      mockSignOut.mockResolvedValueOnce(undefined);

      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifyAdHoc("https://agent.example.com");
      });

      expect(success).toBe(false);
      expect(mockSignOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
    });

    it("sets generic error when response not ok (non-401)", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, 500));
      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifyAdHoc("https://agent.example.com");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("Verification request failed");
    });

    it("sets generic error when fetch throws a non-Error", async () => {
      fetchMock.mockRejectedValueOnce("network down");
      const { result } = renderHook(() => useVerifyConnection());

      let success = true;
      await act(async () => {
        success = await result.current.verifyAdHoc("https://agent.example.com");
      });

      expect(success).toBe(false);
      expect(result.current.verifyError).toBe("Verification failed");
    });
  });

  describe("dismiss", () => {
    it("clears verifyError and verifySampleResponse", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({ success: false, error: "oops", sample_response: { a: 1 } })
      );
      const { result } = renderHook(() => useVerifyConnection());

      await act(async () => {
        await result.current.verifySavedAgent("agent-1");
      });

      expect(result.current.verifyError).toBe("oops");
      expect(result.current.verifySampleResponse).toEqual({ a: 1 });

      act(() => {
        result.current.dismiss();
      });

      expect(result.current.verifyError).toBeNull();
      expect(result.current.verifySampleResponse).toBeNull();
    });
  });

  describe("abandoned attempts", () => {
    it("drops a failure that lands after dismiss, so a fresh attempt is clean", async () => {
      // The user closed a slow check and opened a new one. The abandoned
      // check's error must not paint the new attempt, which on the run picker
      // could be a different agent entirely.
      let settle: (value: Response) => void = () => {};
      fetchMock.mockImplementation(
        () => new Promise<Response>((resolve) => (settle = resolve)),
      );

      const { result } = renderHook(() => useVerifyConnection());

      let first: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.verifySavedAgent("agent-a");
      });
      expect(result.current.isVerifying).toBe(true);

      // User walks away from it.
      act(() => result.current.dismiss());
      expect(result.current.isVerifying).toBe(false);

      // Agent A's check now fails.
      await act(async () => {
        settle(
          jsonResponse({ success: false, error: "agent A is unreachable" }),
        );
        await first;
      });

      expect(result.current.verifyError).toBeNull();
      expect(result.current.verifySampleResponse).toBeNull();
      expect(result.current.isVerifying).toBe(false);
    });

    it("drops a thrown failure that lands after dismiss", async () => {
      let reject: (err: Error) => void = () => {};
      fetchMock.mockImplementation(
        () => new Promise<Response>((_, rej) => (reject = rej)),
      );

      const { result } = renderHook(() => useVerifyConnection());

      let first: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.verifySavedAgent("agent-a");
      });
      act(() => result.current.dismiss());

      await act(async () => {
        reject(new Error("network died"));
        await first;
      });

      expect(result.current.verifyError).toBeNull();
    });

    it("keeps only the newest attempt's result when two overlap", async () => {
      const settlers: Array<(value: Response) => void> = [];
      fetchMock.mockImplementation(
        () => new Promise<Response>((resolve) => settlers.push(resolve)),
      );

      const { result } = renderHook(() => useVerifyConnection());

      let first: Promise<boolean> = Promise.resolve(false);
      let second: Promise<boolean> = Promise.resolve(false);
      act(() => {
        first = result.current.verifySavedAgent("agent-a");
      });
      act(() => {
        second = result.current.verifySavedAgent("agent-b");
      });

      // The older check answers last, and must be ignored.
      await act(async () => {
        settlers[1](jsonResponse({ success: false, error: "B failed" }));
        await second;
        settlers[0](jsonResponse({ success: false, error: "A failed" }));
        await first;
      });

      expect(result.current.verifyError).toBe("B failed");
    });
  });

});
