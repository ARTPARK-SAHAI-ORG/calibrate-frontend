"use client";

import { useCallback, useEffect, useState } from "react";
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
 */
let cachedOrgs: Organization[] | null = null;
let cachedForToken: string | null = null;

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

  const refetch = useCallback(async (): Promise<Organization[] | null> => {
    if (!accessToken) {
      setOrganizations([]);
      setIsLoading(false);
      cachedOrgs = null;
      cachedForToken = null;
      return null;
    }
    const hadCache =
      accessToken === cachedForToken && cachedOrgs !== null;
    try {
      if (!hadCache) setIsLoading(true);
      setError(null);
      const data = await apiGet<Organization[]>("/organizations", accessToken);
      cachedOrgs = data;
      cachedForToken = accessToken;
      setOrganizations(data);
      return data;
    } catch (err) {
      console.error("Error fetching organizations:", err);
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // Keep multiple mounted `useOrganizations` instances in sync: when one
  // mutates a workspace, others refetch so the sidebar switcher reflects
  // changes made on the settings page (and vice versa).
  useEffect(() => {
    const handler = () => {
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
        notifyOrganizationsChanged();
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
        notifyOrganizationsChanged();
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
  removeMember: (userId: string) => Promise<boolean>;
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
    async (userId: string): Promise<boolean> => {
      if (!accessToken || !orgUuid) return false;
      try {
        await apiDelete(
          `/organizations/${orgUuid}/members/${userId}`,
          accessToken,
        );
        setMembers((prev) => prev.filter((m) => m.user_id !== userId));
        return true;
      } catch (err) {
        console.error("Error removing member:", err);
        return false;
      }
    },
    [accessToken, orgUuid],
  );

  return { members, isLoading, error, refetch, addMember, removeMember };
}
