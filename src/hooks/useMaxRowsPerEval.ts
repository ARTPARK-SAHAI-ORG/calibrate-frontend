"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { getActiveOrgUuid } from "@/lib/orgs";
import { useOrgUuid } from "@/lib/nav";
import { useAccessToken } from "./useAccessToken";
import { LIMITS } from "@/constants/limits";

/** The parts of `GET /org-limits/me` the app reads. A null
 *  `max_rows_per_eval` means the workspace has no limit. */
export type OrgLimits = {
  max_rows_per_eval: number | null;
  uses_own_provider_keys: boolean;
};

const FALLBACK: OrgLimits = {
  max_rows_per_eval: LIMITS.DEFAULT_MAX_ROWS_PER_EVAL,
  uses_own_provider_keys: false,
};

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
 * The workspace's limits, outside React. Falls back to the default limits when
 * there is no token or the request fails, so a run is never blocked by an
 * unreachable limit.
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
        // Missing means an older backend; null means no limit.
        max_rows_per_eval:
          data.max_rows_per_eval === undefined
            ? LIMITS.DEFAULT_MAX_ROWS_PER_EVAL
            : data.max_rows_per_eval,
        uses_own_provider_keys: data.uses_own_provider_keys === true,
      }))
      .catch(() => {
        cachedPromise = null;
        return FALLBACK;
      });
  }

  return cachedPromise;
}

/**
 * The workspace's max rows per eval, outside React, or null when it has no
 * limit. Every bulk run reads the limit through this.
 */
export async function getMaxRowsPerEval(
  accessToken: string | null | undefined,
): Promise<number | null> {
  return (await getOrgLimits(accessToken)).max_rows_per_eval;
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

/** The workspace's max rows per eval, or null when it has no limit. */
export function useMaxRowsPerEval(): number | null {
  return useOrgLimits().max_rows_per_eval;
}

/** True when the workspace runs on its own provider keys, which lifts the
 *  limits the app applies on its own (personas, scenarios, text length). */
export function useUsesOwnProviderKeys(): boolean {
  return useOrgLimits().uses_own_provider_keys;
}
