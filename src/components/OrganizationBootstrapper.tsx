"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks";
import { fetchOrganizationsDedup } from "@/hooks/useOrganizations";
import {
  getActiveOrgUuid,
  pickDefaultOrg,
  setActiveOrgUuid,
} from "@/lib/orgs";
import { installOrgFetchInterceptor } from "@/lib/fetchInterceptor";

/**
 * Bootstraps workspace state on the client:
 *
 *  1. Installs the global fetch interceptor that attaches `X-Org-UUID`.
 *  2. When the user has a token but no active workspace stashed locally,
 *     fetches /organizations and picks one (preferring the personal one).
 *
 * Until step 2 completes the backend falls back to the user's personal
 * workspace, so this is safe to run lazily.
 */
export function OrganizationBootstrapper() {
  const { accessToken, isAuthenticated } = useAuth();
  const hasFetchedRef = useRef(false);

  // Install the global fetch interceptor once, as early as possible.
  useEffect(() => {
    installOrgFetchInterceptor();
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !accessToken) return;
    if (getActiveOrgUuid()) return;
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;

    (async () => {
      // Routed through the shared dedup so a concurrent useOrganizations
      // mount (e.g. the sidebar switcher) doesn't make a second request
      // for the same data. fetchOrganizationsDedup also seeds the module
      // cache on success.
      const orgs = await fetchOrganizationsDedup(accessToken);
      if (orgs === null) {
        // Non-fatal: backend falls back to personal workspace without the
        // header. The next user action will trigger a retry.
        hasFetchedRef.current = false;
        return;
      }
      const chosen = pickDefaultOrg(orgs);
      if (chosen) {
        setActiveOrgUuid(chosen.uuid);
      }
    })();
  }, [accessToken, isAuthenticated]);

  return null;
}
