// See parseBackendError.test.ts for why relative specifiers are used here.
jest.mock("../orgs", () => ({
  getActiveOrgUuid: jest.fn(),
}));

jest.mock("../../hooks/useOrganizations", () => ({
  clearOrgsCache: jest.fn(),
}));

import { signOut } from "next-auth/react";
import { getActiveOrgUuid } from "@/lib/orgs";
import { clearOrgsCache } from "@/hooks/useOrganizations";
import {
  getBackendUrl,
  unwrapList,
  getDefaultHeaders,
  apiClient,
  apiGet,
  apiPost,
  apiPut,
  apiDelete,
  type Paginated,
} from "@/lib/api";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

function jsonResponse(status: number, body: unknown, contentType = "application/json") {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => contentType },
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  (getActiveOrgUuid as jest.Mock).mockReturnValue(null);
  global.fetch = jest.fn();
  window.localStorage.clear();
  document.cookie = "";
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("getBackendUrl", () => {
  it("returns the configured backend URL", () => {
    expect(getBackendUrl()).toBe("http://backend.test");
  });

  it("throws when NEXT_PUBLIC_BACKEND_URL is not set", () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    expect(() => getBackendUrl()).toThrow(
      "BACKEND_URL environment variable is not set",
    );
  });
});

describe("unwrapList", () => {
  it("returns the array as-is for a bare array", () => {
    expect(unwrapList([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it("unwraps the { items } envelope", () => {
    const data: Paginated<number> = { items: [1, 2], total: 2, limit: null, offset: 0 };
    expect(unwrapList(data)).toEqual([1, 2]);
  });

  it("unwraps a legacy { runs } payload", () => {
    expect(unwrapList({ runs: [1, 2] })).toEqual([1, 2]);
  });

  it("returns [] for null", () => {
    expect(unwrapList(null)).toEqual([]);
  });

  it("returns [] for an unrelated object", () => {
    expect(unwrapList({ foo: "bar" })).toEqual([]);
  });

  it("returns [] for a primitive", () => {
    expect(unwrapList("hello")).toEqual([]);
  });
});

describe("getDefaultHeaders", () => {
  it("includes only accept when no token or org", () => {
    expect(getDefaultHeaders()).toEqual({ accept: "application/json" });
  });

  it("includes Authorization when accessToken given", () => {
    expect(getDefaultHeaders("tok")).toEqual({
      accept: "application/json",
      Authorization: "Bearer tok",
    });
  });

  it("omits Authorization when accessToken is null", () => {
    expect(getDefaultHeaders(null)).toEqual({ accept: "application/json" });
  });

  it("includes X-Org-UUID when an active org is set", () => {
    (getActiveOrgUuid as jest.Mock).mockReturnValue("org-1");
    expect(getDefaultHeaders("tok")).toEqual({
      accept: "application/json",
      Authorization: "Bearer tok",
      "X-Org-UUID": "org-1",
    });
  });
});

describe("apiClient", () => {
  it("throws when backend URL isn't configured", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    await expect(apiClient("/agents", "tok")).rejects.toThrow(
      "BACKEND_URL environment variable is not set",
    );
  });

  it("issues a GET with default headers and parses JSON", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { ok: true }));
    const result = await apiClient<{ ok: boolean }>("/agents", "tok");
    expect(result).toEqual({ ok: true });
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/agents");
    expect(init.method).toBe("GET");
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(init.body).toBeUndefined();
  });

  it("serializes body and sets Content-Type for requests with a body", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { ok: true }));
    await apiClient("/agents", "tok", { method: "POST", body: { name: "a" } });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("does not overwrite a custom Content-Type header", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));
    await apiClient("/agents", "tok", {
      method: "POST",
      body: { a: 1 },
      headers: { "Content-Type": "text/plain" },
    });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["Content-Type"]).toBe("text/plain");
  });

  it("merges custom headers over default headers", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));
    await apiClient("/agents", "tok", { headers: { "X-Custom": "1" } });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["X-Custom"]).toBe("1");
    expect(init.headers.Authorization).toBe("Bearer tok");
  });

  it("strips X-Org-UUID for /organizations endpoints", async () => {
    (getActiveOrgUuid as jest.Mock).mockReturnValue("org-1");
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));
    await apiClient("/organizations", "tok");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["X-Org-UUID"]).toBeUndefined();
  });

  it("keeps X-Org-UUID for non-/organizations endpoints", async () => {
    (getActiveOrgUuid as jest.Mock).mockReturnValue("org-1");
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}));
    await apiClient("/agents", "tok");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["X-Org-UUID"]).toBe("org-1");
  });

  it("signs out, clears storage/cookies/cache, and throws on 401", async () => {
    window.localStorage.setItem("access_token", "tok");
    window.localStorage.setItem("user", "u");
    window.localStorage.setItem("activeOrgUuid", "org-1");
    document.cookie = "access_token=abc; path=/";
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(401, {}));

    await expect(apiClient("/agents", "tok")).rejects.toThrow(
      "Unauthorized - session expired",
    );

    expect(window.localStorage.getItem("access_token")).toBeNull();
    expect(window.localStorage.getItem("user")).toBeNull();
    expect(window.localStorage.getItem("activeOrgUuid")).toBeNull();
    expect(clearOrgsCache).toHaveBeenCalled();
    expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" });
  });

  it("throws Request failed with status and body text for other non-2xx", async () => {
    const res = jsonResponse(404, {});
    res.text = jest.fn().mockResolvedValue("Not Found");
    (global.fetch as jest.Mock).mockResolvedValue(res);
    await expect(apiClient("/agents/x", "tok")).rejects.toThrow(
      "Request failed: 404 - Not Found",
    );
  });

  it("falls back to 'Unknown error' when reading error text fails", async () => {
    const res = jsonResponse(500, {});
    res.text = jest.fn().mockRejectedValue(new Error("stream broken"));
    (global.fetch as jest.Mock).mockResolvedValue(res);
    await expect(apiClient("/agents/x", "tok")).rejects.toThrow(
      "Request failed: 500 - Unknown error",
    );
  });

  it("returns {} for a 204 No Content response", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(204, undefined));
    const result = await apiClient("/agents/x", "tok", { method: "DELETE" });
    expect(result).toEqual({});
  });

  it("returns {} when content-type header is missing", async () => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, {}, ""));
    const res = jsonResponse(200, {}, "");
    res.headers = { get: () => null };
    (global.fetch as jest.Mock).mockResolvedValue(res);
    const result = await apiClient("/agents/x", "tok");
    expect(result).toEqual({});
  });

  it("returns {} when content-type isn't application/json", async () => {
    const res = jsonResponse(200, {}, "text/plain");
    (global.fetch as jest.Mock).mockResolvedValue(res);
    const result = await apiClient("/agents/x", "tok");
    expect(result).toEqual({});
  });

  it("returns {} when the body text is empty despite a JSON content-type", async () => {
    const res = jsonResponse(200, {}, "application/json");
    res.text = jest.fn().mockResolvedValue("");
    (global.fetch as jest.Mock).mockResolvedValue(res);
    const result = await apiClient("/agents/x", "tok");
    expect(result).toEqual({});
  });
});

describe("convenience wrappers", () => {
  beforeEach(() => {
    (global.fetch as jest.Mock).mockResolvedValue(jsonResponse(200, { ok: true }));
  });

  it("apiGet issues a GET", async () => {
    await apiGet("/agents", "tok");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe("GET");
  });

  it("apiPost issues a POST with the body", async () => {
    await apiPost("/agents", "tok", { name: "a" });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "a" }));
  });

  it("apiPut issues a PUT with the body", async () => {
    await apiPut("/agents/1", "tok", { name: "a" });
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe("PUT");
  });

  it("apiDelete issues a DELETE", async () => {
    await apiDelete("/agents/1", "tok");
    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.method).toBe("DELETE");
  });
});
