"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, apiDelete, apiGet, apiPost } from "@/lib/api";
import {
  ACTIVE_ORG_CHANGED_EVENT,
  ORGANIZATIONS_CHANGED_EVENT,
  type Organization,
  type OrganizationMember,
  getActiveOrgUuid,
  notifyOrganizationsChanged,
  setActiveOrgUuid as persistActiveOrgUuid,
} from "@/lib/orgs";

type UseOrganizationsReturn = {
  organizations: Organization[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<Organization[] | null>;
  createOrganization: (name: string) => Promise<Organization | null>;
  renameOrganization: (
    uuid: string,
    name: string,
  ) => Promise<Organization | null>;
};

/**
 * Module-level cache keyed by access token. Every route in the app
 * remounts AppLayout (and the workspace switcher), so without a cache the
 * sidebar shows a loading flash on every navigation. The cache seeds the
 * initial state on subsequent mounts; we still refetch in the background
 * to stay fresh, but the UI no longer flickers.
 *
 * Cache lifetime is tied to actual sign-out, not to the access token
 * momentarily reading null while the auth hook hydrates from localStorage.
 * Only `clearOrgsCache()` (called from real sign-out paths) wipes it.
 */
let cachedOrgs: Organization[] | null = null;
let cachedForToken: string | null = null;

/**
 * Drop the in-memory workspace list cache. Call this from real sign-out
 * paths (the user clicking Logout, or the 401-triggered auto-sign-out) —
 * not from places where the access token is just transiently null.
 */
export function clearOrgsCache(): void {
  cachedOrgs = null;
  cachedForToken = null;
}

/**
 * Replace the cache with a freshly-fetched list. Useful for paths that
 * already have the latest data in hand (e.g. self-leave) and want the
 * next remount to hydrate without showing stale entries.
 */
export function seedOrgsCache(orgs: Organization[], accessToken: string): void {
  cachedOrgs = orgs;
  cachedForToken = accessToken;
}

/**
 * Shared in-flight fetch promise. When the bootstrapper and the workspace
 * switcher mount in the same tick, they both want /organizations — without
 * this, two requests go out in parallel. With it, the second caller awaits
 * the first caller's promise.
 */
let inFlightFetch: Promise<Organization[] | null> | null = null;
let inFlightToken: string | null = null;

/**
 * Fetch /organizations through the module-level cache + in-flight dedup.
 * Returns null on error (logged).
 */
export async function fetchOrganizationsDedup(
  accessToken: string,
): Promise<Organization[] | null> {
  if (inFlightFetch && inFlightToken === accessToken) return inFlightFetch;
  inFlightToken = accessToken;
  inFlightFetch = (async () => {
    try {
      const data = await apiGet<Organization[]>("/organizations", accessToken);
      cachedOrgs = data;
      cachedForToken = accessToken;
      return data;
    } catch (err) {
      console.error("Error fetching organizations:", err);
      return null;
    } finally {
      inFlightFetch = null;
      inFlightToken = null;
    }
  })();
  return inFlightFetch;
}

/**
 * List + create + rename workspaces for the current user.
 */
export function useOrganizations(
  accessToken: string | null | undefined,
): UseOrganizationsReturn {
  const hasCache =
    !!accessToken && accessToken === cachedForToken && cachedOrgs !== null;
  const [organizations, setOrganizations] = useState<Organization[]>(
    hasCache ? (cachedOrgs as Organization[]) : [],
  );
  // Only show the loading state on the very first fetch for this token.
  // Cached hydration skips it; background refetches don't toggle it either.
  const [isLoading, setIsLoading] = useState(!hasCache);
  const [error, setError] = useState<string | null>(null);
  // Stable per-instance source tag so the mutator can skip the refetch
  // its own notifyOrganizationsChanged() triggers.
  const instanceRef = useRef<symbol>(undefined as unknown as symbol);
  if (instanceRef.current === undefined) {
    instanceRef.current = Symbol("useOrganizations");
  }

  const refetch = useCallback(async (): Promise<Organization[] | null> => {
    if (!accessToken) {
      // The auth hook briefly returns null while it hydrates from
      // localStorage (email/password users) — don't drop the cache here,
      // we'd just have to refetch it a few ms later. Real sign-out paths
      // call clearOrgsCache() explicitly.
      setIsLoading(false);
      return null;
    }
    setError(null);
    const data = await fetchOrganizationsDedup(accessToken);
    if (data === null) {
      setError("Failed to load workspaces");
      setIsLoading(false);
      return null;
    }
    setOrganizations(data);
    setIsLoading(false);
    return data;
  }, [accessToken]);

  // Fetch on mount only when we don't already have a fresh cached list for
  // this token. The bootstrapper fetches once at app start and seeds the
  // cache; subsequent mounts of useOrganizations (sidebar switcher,
  // workspace settings) hydrate from cache and skip the duplicate fetch.
  useEffect(() => {
    if (!accessToken) return;
    if (accessToken === cachedForToken && cachedOrgs !== null) return;
    refetch();
  }, [refetch, accessToken]);

  // Cross-instance sync after mutations. The instance that dispatched the
  // event already applied the change locally + updated the cache, so we
  // skip refetch when the event came from us.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ source?: symbol }>).detail;
      if (detail?.source === instanceRef.current) return;
      refetch();
    };
    window.addEventListener(ORGANIZATIONS_CHANGED_EVENT, handler);
    return () =>
      window.removeEventListener(ORGANIZATIONS_CHANGED_EVENT, handler);
  }, [refetch]);

  const createOrganization = useCallback(
    async (name: string): Promise<Organization | null> => {
      if (!accessToken) return null;
      try {
        const created = await apiPost<Organization>(
          "/organizations",
          accessToken,
          { name },
        );
        setOrganizations((prev) => {
          const next = [...prev, created];
          cachedOrgs = next;
          cachedForToken = accessToken;
          return next;
        });
        notifyOrganizationsChanged(instanceRef.current);
        return created;
      } catch (err) {
        console.error("Error creating organization:", err);
        throw err;
      }
    },
    [accessToken],
  );

  const renameOrganization = useCallback(
    async (uuid: string, name: string): Promise<Organization | null> => {
      if (!accessToken) return null;
      try {
        const updated = await apiClient<Organization>(
          `/organizations/${uuid}`,
          accessToken,
          { method: "PATCH", body: { name } },
        );
        setOrganizations((prev) => {
          const next = prev.map((o) => (o.uuid === uuid ? updated : o));
          cachedOrgs = next;
          cachedForToken = accessToken;
          return next;
        });
        notifyOrganizationsChanged(instanceRef.current);
        return updated;
      } catch (err) {
        console.error("Error renaming organization:", err);
        throw err;
      }
    },
    [accessToken],
  );

  return {
    organizations,
    isLoading,
    error,
    refetch,
    createOrganization,
    renameOrganization,
  };
}

/**
 * Reactive accessor for the active workspace uuid. Subscribes to the custom
 * "active-org-changed" event so components re-render when the user switches.
 */
export function useActiveOrgUuid(): [
  string | null,
  (uuid: string) => void,
] {
  const [uuid, setUuid] = useState<string | null>(null);

  useEffect(() => {
    setUuid(getActiveOrgUuid());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ uuid: string | null }>).detail;
      setUuid(detail?.uuid ?? getActiveOrgUuid());
    };
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handler);
  }, []);

  return [uuid, persistActiveOrgUuid];
}

type UseOrgMembersReturn = {
  members: OrganizationMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addMember: (email: string) => Promise<OrganizationMember | null>;
  removeMember: (userId: string) => Promise<void>;
};

/**
 * List + invite + remove members of a single workspace.
 */
export function useOrgMembers(
  accessToken: string | null | undefined,
  orgUuid: string | null,
): UseOrgMembersReturn {
  const [members, setMembers] = useState<OrganizationMember[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken || !orgUuid) {
      setMembers([]);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await apiGet<OrganizationMember[]>(
        `/organizations/${orgUuid}/members`,
        accessToken,
      );
      setMembers(data);
    } catch (err) {
      console.error("Error fetching members:", err);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, orgUuid]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const addMember = useCallback(
    async (email: string): Promise<OrganizationMember | null> => {
      if (!accessToken || !orgUuid) return null;
      const created = await apiPost<OrganizationMember>(
        `/organizations/${orgUuid}/members`,
        accessToken,
        { email },
      );
      setMembers((prev) => [...prev, created]);
      return created;
    },
    [accessToken, orgUuid],
  );

  const removeMember = useCallback(
    async (userId: string): Promise<void> => {
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      await apiDelete(
        `/organizations/${orgUuid}/members/${userId}`,
        accessToken,
      );
      setMembers((prev) => prev.filter((m) => m.user_id !== userId));
    },
    [accessToken, orgUuid],
  );

  return { members, isLoading, error, refetch, addMember, removeMember };
}
