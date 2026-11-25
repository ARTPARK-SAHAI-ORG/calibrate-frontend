"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { getActiveOrgUuid } from "@/lib/orgs";
import { useOrgUuid } from "@/lib/nav";
import { useAccessToken } from "./useAccessToken";

/** The part of `GET /org-limits/me` the app reads. */
export type OrgLimits = {
  uses_own_provider_keys: boolean;
};

const FALLBACK: OrgLimits = { uses_own_provider_keys: false };

// One request per signed-in user and workspace, shared by every caller.
let cachedPromise: Promise<OrgLimits> | null = null;
let cachedKey: string | null = null;

/** Forget the stored limits, so the next read asks the backend again. Called
 *  after the workspace's provider keys change, since that lifts or restores
 *  its limits. */
export function clearOrgLimitsCache(): void {
  cachedPromise = null;
  cachedKey = null;
}

/**
 * The workspace's limits, outside React. Falls back to the defaults when there
 * is no token or the request fails.
 */
export function getOrgLimits(
  accessToken: string | null | undefined,
): Promise<OrgLimits> {
  if (!accessToken) return Promise.resolve(FALLBACK);
  const key = `${accessToken}:${getActiveOrgUuid() ?? ""}`;
  if (cachedKey !== key) {
    cachedPromise = null;
    cachedKey = key;
  }

  if (!cachedPromise) {
    cachedPromise = apiGet<Partial<OrgLimits>>("/org-limits/me", accessToken)
      .then((data) => ({
        uses_own_provider_keys: data.uses_own_provider_keys === true,
      }))
      .catch(() => {
        cachedPromise = null;
        return FALLBACK;
      });
  }

  return cachedPromise;
}

/** The workspace's limits for rendering. Starts at the default limits and
 *  updates when the backend answers. */
export function useOrgLimits(): OrgLimits {
  const accessToken = useAccessToken();
  const orgUuid = useOrgUuid();
  const [limits, setLimits] = useState<OrgLimits>(FALLBACK);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    getOrgLimits(accessToken).then((value) => {
      if (!cancelled) setLimits(value);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken, orgUuid]);

  return limits;
}

/** True when the workspace runs on its own provider keys, which lifts the
 *  limits the app applies on its own (personas, scenarios, text length). */
export function useUsesOwnProviderKeys(): boolean {
  return useOrgLimits().uses_own_provider_keys;
}
