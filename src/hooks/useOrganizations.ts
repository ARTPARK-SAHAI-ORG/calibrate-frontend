"use client";
import { reportError } from "@/lib/reportError";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient, apiDelete, apiGet, apiPost, apiPut } from "@/lib/api";
import { createRequestCache } from "@/lib/requestCache";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import type { InviteLink } from "@/lib/invites";
import {
  ACTIVE_ORG_CHANGED_EVENT,
  ORGANIZATIONS_CHANGED_EVENT,
  type Organization,
  type OrganizationApiKey,
  type OrganizationApiKeyWithSecret,
  type OrganizationMember,
  type OrganizationSettings,
  type ProviderKey,
  type ProviderKeyProvider,
  type ProviderKeys,
  getRememberedOrgUuid,
  notifyOrganizationsChanged,
  setActiveOrgUuid as persistActiveOrgUuid,
  workspaceShowsLikelyRanges,
} from "@/lib/orgs";
import { useOrgUuid } from "@/lib/nav";
import { useAccessToken } from "./useAccessToken";
import { clearOrgLimitsCache } from "./useMaxRowsPerEval";
import { clearEnabledProvidersCache } from "./useEnabledProviders";

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
  /** Change any part of a workspace. Only what is passed is changed, so
   *  setting one thing never clears another. */
  updateOrganization: (
    uuid: string,
    changes: OrganizationChanges,
  ) => Promise<Organization | null>;
};

/** What can be changed about a workspace. */
export type OrganizationChanges = {
  name?: string;
  settings?: OrganizationSettings;
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
      reportError("Error fetching organizations:", err);
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
  // A null token here means the auth hook is still reading storage, not that
  // the user is signed out (sign-out clears the cache), so a cached list still
  // counts. Without this, every mount would start empty and loading for a
  // render, which callers see as a flash of the loading state on every page.
  const hasCache =
    cachedOrgs !== null && (!accessToken || accessToken === cachedForToken);
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
  // A mount whose token was still null in the first render started with an
  // empty list and isLoading true, so hydrating from the cache here is what
  // ends that loading state — returning early would leave it stuck on forever.
  useEffect(() => {
    if (!accessToken) return;
    if (accessToken === cachedForToken && cachedOrgs !== null) {
      setOrganizations(cachedOrgs);
      setIsLoading(false);
      return;
    }
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
        reportError("Error creating organization:", err);
        throw err;
      }
    },
    [accessToken],
  );

  const updateOrganization = useCallback(
    async (
      uuid: string,
      changes: OrganizationChanges,
    ): Promise<Organization | null> => {
      if (!accessToken) return null;
      try {
        const updated = await apiClient<Organization>(
          `/organizations/${uuid}`,
          accessToken,
          { method: "PATCH", body: changes },
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
        reportError("Error updating organization:", err);
        throw err;
      }
    },
    [accessToken],
  );

  const renameOrganization = useCallback(
    (uuid: string, name: string) => updateOrganization(uuid, { name }),
    [updateOrganization],
  );

  return {
    organizations,
    isLoading,
    error,
    refetch,
    createOrganization,
    renameOrganization,
    updateOrganization,
  };
}

/**
 * The workspace on screen.
 *
 * On a page behind sign-in this is the workspace named by the address, which
 * is right on the very first render. Elsewhere (login, a shared result page)
 * it falls back to the workspace last opened, read after mount and kept
 * current through the "active-org-changed" event.
 */
export function useActiveOrgUuid(): [string | null, (uuid: string) => void] {
  const fromAddress = useOrgUuid();
  const [remembered, setRemembered] = useState<string | null>(null);

  useEffect(() => {
    if (fromAddress) return;
    setRemembered(getRememberedOrgUuid());
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ uuid: string | null }>).detail;
      setRemembered(detail?.uuid ?? getRememberedOrgUuid());
    };
    window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, handler);
    return () => window.removeEventListener(ACTIVE_ORG_CHANGED_EVENT, handler);
  }, [fromAddress]);

  return [fromAddress ?? remembered, persistActiveOrgUuid];
}

/** Whether the active workspace shows likely ranges on agent-test results. */
export function useShowLikelyRanges(): boolean {
  const accessToken = useAccessToken();
  const [activeOrgUuid] = useActiveOrgUuid();
  const { organizations } = useOrganizations(accessToken);
  return workspaceShowsLikelyRanges(
    organizations.find((org) => org.uuid === activeOrgUuid),
  );
}

type UseOrgMembersReturn = {
  members: OrganizationMember[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  addMember: (email: string) => Promise<OrganizationMember | null>;
  removeMember: (userId: string) => Promise<void>;
};

const workspaceKey = (accessToken: string, orgUuid: string) =>
  `${accessToken}:${orgUuid}`;

// Module-level cache + in-flight dedup for a workspace's member list, keyed by
// `${accessToken}:${orgUuid}`. Without it, every visit to workspace settings
// refetches the list; mutations below keep the cache in sync.
const membersCache = createRequestCache<OrganizationMember[]>({
  ttlMs: 30_000,
});
/**
 * List + invite + remove members of a single workspace.
 */
export function useOrgMembers(
  accessToken: string | null | undefined,
  orgUuid: string | null,
): UseOrgMembersReturn {
  const cached =
    accessToken && orgUuid
      ? membersCache.peek(workspaceKey(accessToken, orgUuid))
      : undefined;
  const [members, setMembers] = useState<OrganizationMember[]>(cached ?? []);
  const [isLoading, setIsLoading] = useState(!cached);
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
      const data = await membersCache.fetch(
        workspaceKey(accessToken, orgUuid),
        () =>
          apiGet<OrganizationMember[]>(
            `/organizations/${orgUuid}/members`,
            accessToken,
          ),
      );
      setMembers(data);
    } catch (err) {
      reportError("Error fetching members:", err);
      setError(err instanceof Error ? err.message : "Failed to load members");
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, orgUuid]);

  useEffect(() => {
    if (accessToken && orgUuid) {
      const hit = membersCache.peek(workspaceKey(accessToken, orgUuid));
      if (hit) {
        setMembers(hit);
        setIsLoading(false);
        return;
      }
    }
    refetch();
  }, [accessToken, orgUuid, refetch]);

  const addMember = useCallback(
    async (email: string): Promise<OrganizationMember | null> => {
      // Throws rather than answering null, the way removeMember below does.
      // A null came back looking exactly like a member who was added, so a
      // caller counted it as done and told the reader everybody was in.
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      const created = await apiPost<OrganizationMember>(
        `/organizations/${orgUuid}/members`,
        accessToken,
        { email },
      );
      setMembers((prev) => {
        const next = [...prev, created];
        membersCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
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
      setMembers((prev) => {
        const next = prev.filter((m) => m.user_id !== userId);
        membersCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
    },
    [accessToken, orgUuid],
  );

  return { members, isLoading, error, refetch, addMember, removeMember };
}

type UseOrgInviteLinkReturn = {
  /** The workspace's link, or null when it has none. */
  inviteLink: InviteLink | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Make a link, replacing any existing one. */
  createInviteLink: () => Promise<InviteLink>;
};

// Module-level cache + in-flight dedup for a workspace's invite link, keyed by
// `${accessToken}:${orgUuid}`, the same as the member list above. `null` is a
// real answer here (the workspace has no link), so it is cached like any other.
const inviteLinkCache = createRequestCache<InviteLink | null>({
  ttlMs: 30_000,
});
/**
 * The one invite link a workspace hands out: read it, make it, turn it off.
 *
 * A workspace has at most one link. Making a link when one already exists
 * replaces it, so the old address stops working, and the backend answers with
 * the new one. The backend answers 404 when there is no link, which is not an
 * error to show: it is the ordinary state of a workspace nobody has made a
 * link for.
 */
export function useOrgInviteLink(
  accessToken: string | null | undefined,
  orgUuid: string | null,
): UseOrgInviteLinkReturn {
  const cached =
    accessToken && orgUuid
      ? inviteLinkCache.peek(workspaceKey(accessToken, orgUuid))
      : undefined;
  const [inviteLink, setInviteLink] = useState<InviteLink | null>(
    cached ?? null,
  );
  const [isLoading, setIsLoading] = useState(cached === undefined);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken || !orgUuid) {
      setInviteLink(null);
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      setError(null);
      const data = await inviteLinkCache.fetch(
        workspaceKey(accessToken, orgUuid),
        async () => {
          try {
            const answer = await apiGet<InviteLink>(
              `/organizations/${orgUuid}/invite-link`,
              accessToken,
            );
            // An empty answer is no link, not a link with nothing in it.
            // apiClient turns a 204 or an empty body into `{}`, which is
            // truthy, and the panel would have shown and copied an address
            // ending in "undefined".
            return answer?.token ? answer : null;
          } catch (err) {
            // No link made yet. That is the starting state, not a failure.
            if (
              err instanceof Error &&
              err.message.startsWith("Request failed: 404")
            ) {
              return null;
            }
            throw err;
          }
        },
      );
      setInviteLink(data);
    } catch (err) {
      reportError("Error fetching invite link:", err);
      setError(
        err instanceof Error ? err.message : "Failed to load the invite link",
      );
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, orgUuid]);

  useEffect(() => {
    if (accessToken && orgUuid) {
      const hit = inviteLinkCache.peek(workspaceKey(accessToken, orgUuid));
      if (hit !== undefined) {
        setInviteLink(hit);
        setIsLoading(false);
        return;
      }
    }
    refetch();
  }, [accessToken, orgUuid, refetch]);

  const createInviteLink = useCallback(async (): Promise<InviteLink> => {
    if (!accessToken || !orgUuid) {
      throw new Error("Not signed in");
    }
    const created = await apiPost<InviteLink>(
      `/organizations/${orgUuid}/invite-link`,
      accessToken,
      {},
    );
    inviteLinkCache.set(workspaceKey(accessToken, orgUuid), created);
    setInviteLink(created);
    return created;
  }, [accessToken, orgUuid]);

  return {
    inviteLink,
    isLoading,
    error,
    refetch,
    createInviteLink,
  };
}

type UseWorkspaceApiKeysReturn = {
  apiKeys: OrganizationApiKey[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Returns the created key including its one-time plaintext secret. */
  createApiKey: (name: string) => Promise<OrganizationApiKeyWithSecret>;
  revokeApiKey: (keyUuid: string) => Promise<void>;
};

/** Loads one workspace-scoped list through a 30-second cache. A mount reuses
 *  the stored copy; `refetch` always asks the backend again. */
function useCachedWorkspaceGet<T>(
  cache: ReturnType<typeof createRequestCache<T>>,
  path: string,
  empty: T,
  noun: string,
  accessToken: string | null | undefined,
  orgUuid: string | null,
) {
  const cached =
    accessToken && orgUuid
      ? cache.peek(workspaceKey(accessToken, orgUuid))
      : undefined;
  const [data, setData] = useState<T>(cached ?? empty);
  const [isLoading, setIsLoading] = useState(!cached);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (fresh: boolean) => {
      if (!accessToken || !orgUuid) {
        setData(empty);
        setIsLoading(false);
        return;
      }
      try {
        setIsLoading(true);
        setError(null);
        const key = workspaceKey(accessToken, orgUuid);
        if (fresh) cache.invalidate(key);
        setData(await cache.fetch(key, () => apiGet<T>(path, accessToken)));
      } catch (err) {
        reportError(`Error fetching ${noun}:`, err);
        setError(parseBackendErrorMessage(err, `Failed to load ${noun}`));
      } finally {
        setIsLoading(false);
      }
    },
    [accessToken, orgUuid, cache, path, empty, noun],
  );
  const refetch = useCallback(() => load(true), [load]);

  useEffect(() => {
    if (accessToken && orgUuid) {
      const hit = cache.peek(workspaceKey(accessToken, orgUuid));
      if (hit) {
        setData(hit);
        setIsLoading(false);
        return;
      }
    }
    void load(false);
  }, [accessToken, orgUuid, cache, load]);

  return { data, setData, isLoading, error, refetch };
}

/**
 * List + create + revoke API keys for the active workspace. Keys are scoped by
 * the `X-Org-UUID` header (attached automatically in api.ts), so the endpoints
 * are the bare `/api-keys` — NOT under `/organizations/...`, which would strip
 * that header. The backend returns the full secret only in the create
 * response; the list returns masked keys (`masked_key` / `last_four`).
 *
 * `orgUuid` isn't sent in the URL, but is kept as a gate + refetch dependency
 * so the list reloads when the user switches workspaces.
 */
// Module-level cache + in-flight dedup for a workspace's API keys, keyed by
// `${accessToken}:${orgUuid}` (the request itself is scoped by the X-Org-UUID
// header, so orgUuid is the partitioning dimension). Mutations keep it in sync.
const apiKeysCache = createRequestCache<OrganizationApiKey[]>({
  ttlMs: 30_000,
});
const EMPTY_API_KEYS: OrganizationApiKey[] = [];

export function useWorkspaceApiKeys(
  accessToken: string | null | undefined,
  orgUuid: string | null,
): UseWorkspaceApiKeysReturn {
  const {
    data: apiKeys,
    setData: setApiKeys,
    isLoading,
    error,
    refetch,
  } = useCachedWorkspaceGet(
    apiKeysCache,
    "/api-keys",
    EMPTY_API_KEYS,
    "API keys",
    accessToken,
    orgUuid,
  );

  const createApiKey = useCallback(
    async (name: string): Promise<OrganizationApiKeyWithSecret> => {
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      const created = await apiPost<OrganizationApiKeyWithSecret>(
        "/api-keys",
        accessToken,
        { name },
      );
      // Strip the one-time secret before storing in the list.
      const { key: _key, ...masked } = created;
      void _key;
      setApiKeys((prev) => {
        const next = [...prev, masked];
        apiKeysCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
      return created;
    },
    [accessToken, orgUuid, setApiKeys],
  );

  const revokeApiKey = useCallback(
    async (keyUuid: string): Promise<void> => {
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      await apiDelete(`/api-keys/${keyUuid}`, accessToken);
      setApiKeys((prev) => {
        const next = prev.filter((k) => k.uuid !== keyUuid);
        apiKeysCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
    },
    [accessToken, orgUuid, setApiKeys],
  );

  return { apiKeys, isLoading, error, refetch, createApiKey, revokeApiKey };
}

type UseProviderKeysReturn = {
  keys: ProviderKey[];
  usesOwnKeys: boolean;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  saveProviderKey: (
    provider: ProviderKeyProvider,
    value: string,
  ) => Promise<ProviderKey>;
  removeProviderKey: (provider: ProviderKeyProvider) => Promise<void>;
};

const providerKeysCache = createRequestCache<ProviderKeys>({
  ttlMs: 30_000,
});

const EMPTY_PROVIDER_KEYS: ProviderKeys = { uses_own_keys: false, keys: [] };

/** Saving or removing a key changes which providers the workspace can run and
 *  whether its limits apply, so both stored answers are dropped. */
function forgetProviderDependentCaches(): void {
  clearOrgLimitsCache();
  clearEnabledProvidersCache();
}

export function useProviderKeys(
  accessToken: string | null | undefined,
  orgUuid: string | null,
): UseProviderKeysReturn {
  const { data, setData, isLoading, error, refetch } = useCachedWorkspaceGet(
    providerKeysCache,
    "/provider-keys",
    EMPTY_PROVIDER_KEYS,
    "provider keys",
    accessToken,
    orgUuid,
  );

  const saveProviderKey = useCallback(
    async (
      provider: ProviderKeyProvider,
      value: string,
    ): Promise<ProviderKey> => {
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      const saved = await apiPut<ProviderKey>(
        `/provider-keys/${provider}`,
        accessToken,
        { value },
      );
      forgetProviderDependentCaches();
      setData((prev) => {
        const next: ProviderKeys = {
          uses_own_keys: true,
          keys: [...prev.keys.filter((k) => k.provider !== provider), saved],
        };
        providerKeysCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
      return saved;
    },
    [accessToken, orgUuid, setData],
  );

  const removeProviderKey = useCallback(
    async (provider: ProviderKeyProvider): Promise<void> => {
      if (!accessToken || !orgUuid) {
        throw new Error("Not signed in");
      }
      await apiDelete(`/provider-keys/${provider}`, accessToken);
      forgetProviderDependentCaches();
      setData((prev) => {
        const keys = prev.keys.filter((k) => k.provider !== provider);
        const next: ProviderKeys = { uses_own_keys: keys.length > 0, keys };
        providerKeysCache.set(workspaceKey(accessToken, orgUuid), next);
        return next;
      });
    },
    [accessToken, orgUuid, setData],
  );

  return {
    keys: data.keys,
    usesOwnKeys: data.uses_own_keys,
    isLoading,
    error,
    refetch,
    saveProviderKey,
    removeProviderKey,
  };
}
