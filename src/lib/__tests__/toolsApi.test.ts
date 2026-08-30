import { deleteTool } from "../toolsApi";
import { signOut } from "next-auth/react";

jest.mock("next-auth/react", () => ({
  signOut: jest.fn(),
}));

const originalFetch = global.fetch;

describe("deleteTool", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    (signOut as jest.Mock).mockClear();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("sends a DELETE to /tools/{uuid} with the signed-in token", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true } as Response);
    global.fetch = fetchMock as unknown as typeof fetch;

    await deleteTool("tool-1", "tok");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://backend.test/tools/tool-1");
    expect(init.method).toBe("DELETE");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("throws when the backend refuses the delete", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 500,
      } as Response) as unknown as typeof fetch;

    await expect(deleteTool("tool-1", "tok")).rejects.toThrow(
      "Failed to delete tool",
    );
  });

  it("signs out on a 401 instead of throwing", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
      } as Response) as unknown as typeof fetch;

    await deleteTool("tool-1", "tok");
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });
});
