"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks";
import { apiGet } from "@/lib/api";
import {
  type Organization,
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
      try {
        const orgs = await apiGet<Organization[]>(
          "/organizations",
          accessToken,
        );
        const chosen = pickDefaultOrg(orgs);
        if (chosen) {
          setActiveOrgUuid(chosen.uuid);
        }
      } catch (err) {
        // Non-fatal: the backend falls back to the personal workspace when
        // the header is missing, so the user keeps working — they just
        // can't switch workspaces until this succeeds on a later request.
        console.error("Failed to bootstrap active workspace:", err);
        hasFetchedRef.current = false;
      }
    })();
  }, [accessToken, isAuthenticated]);

  return null;
}
