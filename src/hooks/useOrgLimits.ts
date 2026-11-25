"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { getActiveOrgUuid } from "@/lib/orgs";
import { useOrgUuid } from "@/lib/nav";
import { useAccessToken } from "./useAccessToken";
import { LIMITS } from "@/constants/limits";

/** The parts of `GET /org-limits/me` the app reads. */
export type OrgLimits = {
  uses_own_provider_keys: boolean;
  /** Replies one chat link may send a day; null means no limit. */
  max_chat_replies_per_day: number | null;
};

const FALLBACK: OrgLimits = {
  uses_own_provider_keys: false,
  max_chat_replies_per_day: LIMITS.DEFAULT_MAX_CHAT_REPLIES_PER_DAY,
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
        max_chat_replies_per_day:
          data.max_chat_replies_per_day === undefined
            ? LIMITS.DEFAULT_MAX_CHAT_REPLIES_PER_DAY
            : data.max_chat_replies_per_day,
      }))
      .catch(() => {
        cachedPromise = null;
        return FALLBACK;
      });
  }

  return cachedPromise;
}

/** The workspace's limits as the backend answered them: null until it has,
 *  and FALLBACK itself when it could not be asked or did not answer. */
function useAnsweredOrgLimits(): OrgLimits | null {
  const accessToken = useAccessToken();
  const orgUuid = useOrgUuid();
  const [limits, setLimits] = useState<OrgLimits | null>(null);

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

/** The workspace's limits for rendering. Starts at the default limits and
 *  updates when the backend answers. */
export function useOrgLimits(): OrgLimits {
  return useAnsweredOrgLimits() ?? FALLBACK;
}

/** Whether the workspace runs on its own provider keys, or null while that is
 *  not known: before the backend answers, or when it did not. For a check
 *  that must not guess, where the default answer would wrongly block. */
export function useUsesOwnProviderKeysIfKnown(): boolean | null {
  const limits = useAnsweredOrgLimits();
  return limits === null || limits === FALLBACK
    ? null
    : limits.uses_own_provider_keys;
}

/** True when the workspace runs on its own provider keys, which lifts the
 *  limits the app applies on its own (personas, scenarios, text length). */
export function useUsesOwnProviderKeys(): boolean {
  return useOrgLimits().uses_own_provider_keys;
}
