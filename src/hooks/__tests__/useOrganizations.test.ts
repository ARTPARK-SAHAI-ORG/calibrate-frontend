import { renderHook, act, waitFor } from "@testing-library/react";
import {
  useOrganizations,
  useActiveOrgUuid,
  useOrgMembers,
  useWorkspaceApiKeys,
  clearOrgsCache,
  seedOrgsCache,
  fetchOrganizationsDedup,
} from "@/hooks/useOrganizations";
import { apiClient, apiDelete, apiGet, apiPost } from "@/lib/api";
import {
  ACTIVE_ORG_CHANGED_EVENT,
  ORGANIZATIONS_CHANGED_EVENT,
  getActiveOrgUuid,
  setActiveOrgUuid,
  type Organization,
  type OrganizationMember,
  type OrganizationApiKeyWithSecret,
} from "@/lib/orgs";
import { reportError } from "@/lib/reportError";

// Use relative specifiers here (not the "@/" alias): next/jest's SWC
// transform rewrites "@/..." to relative paths only in import/export
// declarations, not in arbitrary string arguments like jest.mock()'s first
// argument. Jest's own resolver has no moduleNameMapper for "@/", so
// jest.mock("@/lib/api", ...) fails to resolve. Jest mocks are keyed by the
// resolved absolute file path though, so a relative specifier here still
// intercepts the hook's "@/lib/api" import (same underlying file).
jest.mock("../../lib/api", () => ({
  apiClient: jest.fn(),
  apiDelete: jest.fn(),
  apiGet: jest.fn(),
  apiPost: jest.fn(),
}));

jest.mock("../../lib/orgs", () => {
  const actual = jest.requireActual("../../lib/orgs");
  return {
    ...actual,
    getActiveOrgUuid: jest.fn(),
    setActiveOrgUuid: jest.fn(),
    notifyOrganizationsChanged: jest.fn(actual.notifyOrganizationsChanged),
  };
});

jest.mock("../../lib/reportError", () => ({
  reportError: jest.fn(),
}));

const mockApiGet = apiGet as jest.Mock;
const mockApiPost = apiPost as jest.Mock;
const mockApiClient = apiClient as jest.Mock;
const mockApiDelete = apiDelete as jest.Mock;
const mockGetActiveOrgUuid = getActiveOrgUuid as jest.Mock;
const mockSetActiveOrgUuid = setActiveOrgUuid as jest.Mock;

const org1: Organization = {
  uuid: "org-1",
  name: "Org One",
  is_personal: true,
  created_by_user_id: "u1",
  member_role: "owner",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

const org2: Organization = {
  uuid: "org-2",
  name: "Org Two",
  is_personal: false,
  created_by_user_id: "u1",
  member_role: "admin",
  created_at: "2024-01-01",
  updated_at: "2024-01-01",
};

describe("useOrganizations hooks", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearOrgsCache();
  });

  describe("clearOrgsCache / seedOrgsCache / fetchOrganizationsDedup", () => {
    it("fetches and caches organizations", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const result = await fetchOrganizationsDedup("token-a");
      expect(result).toEqual([org1]);
      expect(mockApiGet).toHaveBeenCalledWith("/organizations", "token-a");
    });

    it("dedupes concurrent in-flight fetches for the same token", async () => {
      let resolveFn: (v: Organization[]) => void;
      mockApiGet.mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
      );
      const p1 = fetchOrganizationsDedup("token-b");
      const p2 = fetchOrganizationsDedup("token-b");
      resolveFn!([org2]);
      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toEqual([org2]);
      expect(r2).toEqual([org2]);
      expect(mockApiGet).toHaveBeenCalledTimes(1);
    });

    it("returns null and reports error on failure", async () => {
      mockApiGet.mockRejectedValueOnce(new Error("boom"));
      const result = await fetchOrganizationsDedup("token-c");
      expect(result).toBeNull();
      expect(reportError).toHaveBeenCalledWith(
        "Error fetching organizations:",
        expect.any(Error),
      );
    });

    it("seedOrgsCache seeds a fresh cache used to hydrate a new hook instance", async () => {
      seedOrgsCache([org1, org2], "seeded-token");
      const { result } = renderHook(() => useOrganizations("seeded-token"));
      // Hydrated synchronously from cache, no loading flash.
      expect(result.current.isLoading).toBe(false);
      expect(result.current.organizations).toEqual([org1, org2]);
    });
  });

  describe("useOrganizations", () => {
    it("does nothing when accessToken is null/undefined", async () => {
      const { result } = renderHook(() => useOrganizations(null));
      // The mount effect bails out early for a null token without ever
      // calling setIsLoading(false), so isLoading stays at its initial
      // (true) value until something explicitly calls refetch().
      expect(result.current.isLoading).toBe(true);
      expect(result.current.organizations).toEqual([]);

      const created = await act(async () => result.current.createOrganization("x"));
      expect(created).toBeNull();

      const renamed = await act(async () =>
        result.current.renameOrganization("u", "x"),
      );
      expect(renamed).toBeNull();

      const refetched = await act(async () => result.current.refetch());
      expect(refetched).toBeNull();
      // refetch() itself does set isLoading false when accessToken is null.
      expect(result.current.isLoading).toBe(false);
    });

    it("fetches organizations on mount and sets loading states", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.organizations).toEqual([org1]);
      expect(result.current.error).toBeNull();
    });

    it("sets an error when the fetch fails", async () => {
      mockApiGet.mockRejectedValueOnce(new Error("fail"));
      const { result } = renderHook(() => useOrganizations("tok-err"));

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("Failed to load workspaces");
      expect(result.current.organizations).toEqual([]);
    });

    it("skips the mount fetch when a fresh cache already exists for the token", async () => {
      seedOrgsCache([org1], "cached-tok");
      const { result } = renderHook(() => useOrganizations("cached-tok"));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.organizations).toEqual([org1]);
      // Wait a tick to ensure no fetch happens.
      await waitFor(() => expect(mockApiGet).not.toHaveBeenCalled());
    });

    it("createOrganization posts, updates state/cache, and notifies other instances", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(org2);
      let created: Organization | null = null;
      await act(async () => {
        created = await result.current.createOrganization("Org Two");
      });
      expect(created).toEqual(org2);
      expect(mockApiPost).toHaveBeenCalledWith("/organizations", "tok", {
        name: "Org Two",
      });
      expect(result.current.organizations).toEqual([org1, org2]);
    });

    it("createOrganization reports and rethrows on failure", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const err = new Error("create failed");
      mockApiPost.mockRejectedValueOnce(err);
      await expect(
        act(async () => {
          await result.current.createOrganization("bad");
        }),
      ).rejects.toThrow("create failed");
      expect(reportError).toHaveBeenCalledWith(
        "Error creating organization:",
        err,
      );
    });

    it("renameOrganization patches, updates matching entry, and notifies", async () => {
      mockApiGet.mockResolvedValueOnce([org1, org2]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const renamedOrg = { ...org1, name: "Renamed" };
      mockApiClient.mockResolvedValueOnce(renamedOrg);
      let updated: Organization | null = null;
      await act(async () => {
        updated = await result.current.renameOrganization("org-1", "Renamed");
      });
      expect(updated).toEqual(renamedOrg);
      expect(mockApiClient).toHaveBeenCalledWith("/organizations/org-1", "tok", {
        method: "PATCH",
        body: { name: "Renamed" },
      });
      expect(result.current.organizations).toEqual([renamedOrg, org2]);
    });

    it("renameOrganization reports and rethrows on failure", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      const err = new Error("rename failed");
      mockApiClient.mockRejectedValueOnce(err);
      await expect(
        act(async () => {
          await result.current.renameOrganization("org-1", "bad");
        }),
      ).rejects.toThrow("rename failed");
      expect(reportError).toHaveBeenCalledWith(
        "Error renaming organization:",
        err,
      );
    });

    it("refetches when another instance dispatches ORGANIZATIONS_CHANGED_EVENT with a different source", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiGet.mockResolvedValueOnce([org1, org2]);
      await act(async () => {
        window.dispatchEvent(
          new CustomEvent(ORGANIZATIONS_CHANGED_EVENT, {
            detail: { source: Symbol("other-instance") },
          }),
        );
      });
      await waitFor(() =>
        expect(result.current.organizations).toEqual([org1, org2]),
      );
    });

    it("skips refetch when the event's source matches its own instance (createOrganization path)", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiGet.mockClear();
      mockApiPost.mockResolvedValueOnce(org2);
      await act(async () => {
        await result.current.createOrganization("Org Two");
      });
      // The instance's own notifyOrganizationsChanged should not trigger
      // an additional refetch (apiGet not called again).
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it("cleans up the ORGANIZATIONS_CHANGED_EVENT listener on unmount", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result, unmount } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      const removeSpy = jest.spyOn(window, "removeEventListener");
      unmount();
      expect(removeSpy).toHaveBeenCalledWith(
        ORGANIZATIONS_CHANGED_EVENT,
        expect.any(Function),
      );
      removeSpy.mockRestore();
    });

    it("event handler falls back to getActiveOrgUuid-less refetch when detail is undefined", async () => {
      mockApiGet.mockResolvedValueOnce([org1]);
      const { result } = renderHook(() => useOrganizations("tok"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiGet.mockResolvedValueOnce([org1, org2]);
      await act(async () => {
        window.dispatchEvent(new CustomEvent(ORGANIZATIONS_CHANGED_EVENT));
      });
      await waitFor(() =>
        expect(result.current.organizations).toEqual([org1, org2]),
      );
    });
  });

  describe("useActiveOrgUuid", () => {
    it("initializes from getActiveOrgUuid and updates on event with explicit uuid", async () => {
      mockGetActiveOrgUuid.mockReturnValue("org-1");
      const { result } = renderHook(() => useActiveOrgUuid());
      await waitFor(() => expect(result.current[0]).toBe("org-1"));

      act(() => {
        window.dispatchEvent(
          new CustomEvent(ACTIVE_ORG_CHANGED_EVENT, {
            detail: { uuid: "org-2" },
          }),
        );
      });
      expect(result.current[0]).toBe("org-2");
    });

    it("falls back to getActiveOrgUuid() when the event detail has no uuid", async () => {
      mockGetActiveOrgUuid.mockReturnValueOnce("org-1").mockReturnValueOnce("org-3");
      const { result } = renderHook(() => useActiveOrgUuid());
      await waitFor(() => expect(result.current[0]).toBe("org-1"));

      act(() => {
        window.dispatchEvent(new CustomEvent(ACTIVE_ORG_CHANGED_EVENT));
      });
      expect(result.current[0]).toBe("org-3");
    });

    it("exposes persistActiveOrgUuid (setActiveOrgUuid) as the setter", () => {
      mockGetActiveOrgUuid.mockReturnValue(null);
      const { result } = renderHook(() => useActiveOrgUuid());
      act(() => {
        result.current[1]("org-9");
      });
      expect(mockSetActiveOrgUuid).toHaveBeenCalledWith("org-9");
    });

    it("removes the event listener on unmount", async () => {
      mockGetActiveOrgUuid.mockReturnValue(null);
      const { unmount } = renderHook(() => useActiveOrgUuid());
      const removeSpy = jest.spyOn(window, "removeEventListener");
      unmount();
      expect(removeSpy).toHaveBeenCalledWith(
        ACTIVE_ORG_CHANGED_EVENT,
        expect.any(Function),
      );
      removeSpy.mockRestore();
    });
  });

  describe("useOrgMembers", () => {
    const member: OrganizationMember = {
      user_id: "u1",
      email: "a@b.com",
      first_name: "A",
      last_name: "B",
      role: "owner",
      created_at: "2024-01-01",
    };

    it("clears members and skips fetch when accessToken or orgUuid is missing", async () => {
      const { result, rerender } = renderHook(
        ({ token, uuid }) => useOrgMembers(token, uuid),
        { initialProps: { token: null as string | null, uuid: null as string | null } },
      );
      expect(result.current.isLoading).toBe(false);
      expect(result.current.members).toEqual([]);

      rerender({ token: "tok", uuid: null });
      expect(result.current.members).toEqual([]);
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it("fetches members successfully", async () => {
      mockApiGet.mockResolvedValueOnce([member]);
      const { result } = renderHook(() => useOrgMembers("tok", "org-1"));
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.members).toEqual([member]);
      expect(mockApiGet).toHaveBeenCalledWith(
        "/organizations/org-1/members",
        "tok",
      );
    });

    it("sets error message from an Error instance on fetch failure", async () => {
      mockApiGet.mockRejectedValueOnce(new Error("members failed"));
      const { result } = renderHook(() => useOrgMembers("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("members failed");
      expect(reportError).toHaveBeenCalledWith(
        "Error fetching members:",
        expect.any(Error),
      );
    });

    it("sets a generic error message when a non-Error is thrown", async () => {
      mockApiGet.mockRejectedValueOnce("weird failure");
      const { result } = renderHook(() => useOrgMembers("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("Failed to load members");
    });

    it("addMember posts and appends to the list", async () => {
      mockApiGet.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useOrgMembers("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(member);
      let added: OrganizationMember | null = null;
      await act(async () => {
        added = await result.current.addMember("a@b.com");
      });
      expect(added).toEqual(member);
      expect(mockApiPost).toHaveBeenCalledWith(
        "/organizations/org-1/members",
        "tok",
        { email: "a@b.com" },
      );
      expect(result.current.members).toEqual([member]);
    });

    it("addMember returns null when accessToken or orgUuid missing", async () => {
      const { result } = renderHook(() => useOrgMembers(null, null));
      const added = await act(async () => result.current.addMember("x@y.com"));
      expect(added).toBeNull();
    });

    it("removeMember deletes and filters the list", async () => {
      mockApiGet.mockResolvedValueOnce([member]);
      const { result } = renderHook(() => useOrgMembers("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiDelete.mockResolvedValueOnce(undefined);
      await act(async () => {
        await result.current.removeMember("u1");
      });
      expect(mockApiDelete).toHaveBeenCalledWith(
        "/organizations/org-1/members/u1",
        "tok",
      );
      expect(result.current.members).toEqual([]);
    });

    it("removeMember throws when not signed in", async () => {
      const { result } = renderHook(() => useOrgMembers(null, null));
      await expect(
        act(async () => {
          await result.current.removeMember("u1");
        }),
      ).rejects.toThrow("Not signed in");
    });
  });

  describe("useWorkspaceApiKeys", () => {
    const keyWithSecret: OrganizationApiKeyWithSecret = {
      uuid: "k1",
      name: "CI key",
      last_four: "ab12",
      masked_key: "sk_****ab12",
      last_used_at: null,
      created_at: "2024-01-01",
      updated_at: "2024-01-01",
      key: "sk_full_plaintext_secret",
    };

    it("clears keys and skips fetch when accessToken or orgUuid missing", async () => {
      const { result } = renderHook(() => useWorkspaceApiKeys(null, null));
      expect(result.current.isLoading).toBe(false);
      expect(result.current.apiKeys).toEqual([]);
      expect(mockApiGet).not.toHaveBeenCalled();
    });

    it("fetches api keys successfully", async () => {
      const { key: _key, ...masked } = keyWithSecret;
      void _key;
      mockApiGet.mockResolvedValueOnce([masked]);
      const { result } = renderHook(() => useWorkspaceApiKeys("tok", "org-1"));
      expect(result.current.isLoading).toBe(true);

      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.apiKeys).toEqual([masked]);
      expect(mockApiGet).toHaveBeenCalledWith("/api-keys", "tok");
    });

    it("sets error message from an Error instance on fetch failure", async () => {
      mockApiGet.mockRejectedValueOnce(new Error("keys failed"));
      const { result } = renderHook(() => useWorkspaceApiKeys("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("keys failed");
      expect(reportError).toHaveBeenCalledWith(
        "Error fetching API keys:",
        expect.any(Error),
      );
    });

    it("sets a generic error message when a non-Error is thrown", async () => {
      mockApiGet.mockRejectedValueOnce("weird failure");
      const { result } = renderHook(() => useWorkspaceApiKeys("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));
      expect(result.current.error).toBe("Failed to load API keys");
    });

    it("createApiKey posts, strips the secret from stored list, and returns the full response", async () => {
      mockApiGet.mockResolvedValueOnce([]);
      const { result } = renderHook(() => useWorkspaceApiKeys("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiPost.mockResolvedValueOnce(keyWithSecret);
      let created: OrganizationApiKeyWithSecret | null = null;
      await act(async () => {
        created = await result.current.createApiKey("CI key");
      });
      expect(created).toEqual(keyWithSecret);
      expect(mockApiPost).toHaveBeenCalledWith("/api-keys", "tok", {
        name: "CI key",
      });
      expect(result.current.apiKeys).toEqual([
        {
          uuid: "k1",
          name: "CI key",
          last_four: "ab12",
          masked_key: "sk_****ab12",
          last_used_at: null,
          created_at: "2024-01-01",
          updated_at: "2024-01-01",
        },
      ]);
    });

    it("createApiKey throws when not signed in", async () => {
      const { result } = renderHook(() => useWorkspaceApiKeys(null, null));
      await expect(
        act(async () => {
          await result.current.createApiKey("x");
        }),
      ).rejects.toThrow("Not signed in");
    });

    it("revokeApiKey deletes and filters the list", async () => {
      const { key: _key, ...masked } = keyWithSecret;
      void _key;
      mockApiGet.mockResolvedValueOnce([masked]);
      const { result } = renderHook(() => useWorkspaceApiKeys("tok", "org-1"));
      await waitFor(() => expect(result.current.isLoading).toBe(false));

      mockApiDelete.mockResolvedValueOnce(undefined);
      await act(async () => {
        await result.current.revokeApiKey("k1");
      });
      expect(mockApiDelete).toHaveBeenCalledWith("/api-keys/k1", "tok");
      expect(result.current.apiKeys).toEqual([]);
    });

    it("revokeApiKey throws when not signed in", async () => {
      const { result } = renderHook(() => useWorkspaceApiKeys(null, null));
      await expect(
        act(async () => {
          await result.current.revokeApiKey("k1");
        }),
      ).rejects.toThrow("Not signed in");
    });
  });
});
