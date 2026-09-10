// api.ts pulls in the workspaces hook only to empty its cache on a 401, which
// nothing here exercises. Faking it keeps this file to the invite calls.
// Relative specifiers, not "@/", for the reason spelled out in api.test.ts.
jest.mock("../../hooks/useOrganizations", () => ({
  clearOrgsCache: jest.fn(),
}));

import {
  buildInviteUrl,
  fetchInvitePreview,
  acceptInvite,
} from "@/lib/invites";
import { ACTIVE_ORG_UUID_KEY, type Organization } from "@/lib/orgs";

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_BACKEND_URL;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => "application/json" },
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
  global.fetch = jest.fn();
  window.localStorage.clear();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("buildInviteUrl", () => {
  it("returns the invite address on this site", () => {
    expect(buildInviteUrl("tok-123")).toBe(
      `${window.location.origin}/invite/tok-123`,
    );
  });
});

describe("fetchInvitePreview", () => {
  it("returns the workspace name when the link is known", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { organization_name: "Field Team" }),
    );

    await expect(fetchInvitePreview("tok-123")).resolves.toEqual({
      organization_name: "Field Team",
    });
    expect(global.fetch).toHaveBeenCalledWith(
      "http://backend.test/public/invite/tok-123",
      { headers: { accept: "application/json" } },
    );
  });

  it("returns null when the link is unknown or turned off", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(404, { detail: "Not found" }),
    );

    await expect(fetchInvitePreview("gone")).resolves.toBeNull();
  });

  // Only a 404 means the link is really gone. Any other failure has to be
  // thrown, so the page can say it could not check rather than telling someone
  // their good link is dead.
  it("throws, rather than saying the link is gone, when the backend fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(500, { detail: "Server error" }),
    );

    await expect(fetchInvitePreview("tok-123")).rejects.toThrow(
      "Request failed: 500",
    );
  });

  it("escapes the token into the address", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      jsonResponse(200, { organization_name: "Field Team" }),
    );

    await fetchInvitePreview("a/b c");

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://backend.test/public/invite/a%2Fb%20c",
    );
  });
});

describe("acceptInvite", () => {
  const org: Organization = {
    uuid: "org-1",
    name: "Field Team",
    is_personal: false,
    created_by_user_id: "u1",
    member_role: "admin",
    created_at: "2024-01-01",
    updated_at: "2024-01-01",
  };

  it("posts to the accept address and returns the workspace", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, org));

    await expect(acceptInvite("tok-123", "token-a")).resolves.toEqual(org);

    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe("http://backend.test/invites/tok-123/accept");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer token-a");
  });

  it("escapes the token into the address", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, org));

    await acceptInvite("a/b", "token-a");

    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe(
      "http://backend.test/invites/a%2Fb/accept",
    );
  });

  it("does not send the remembered workspace with the request", async () => {
    // The invite page carries no workspace in its address, so without this the
    // header would carry over whichever workspace the reader last had open.
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, "org-last-opened");
    (global.fetch as jest.Mock).mockResolvedValueOnce(jsonResponse(200, org));

    await acceptInvite("tok-123", "token-a");

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(init.headers["X-Org-UUID"]).toBeUndefined();
  });
});
