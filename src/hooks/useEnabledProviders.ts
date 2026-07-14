"use client";

import { useEffect, useState } from "react";
import { getBackendUrl, getDefaultHeaders } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useAccessToken } from "./useAccessToken";

/**
 * Provider gating for the STT/TTS pickers.
 *
 * The backend's `GET /providers` returns the providers whose API keys are
 * configured in the current environment, as a plain name list:
 *   { "providers": ["deepgram", "openai", "google", "sarvam", ...] }
 *
 * These names match our STT/TTS provider `value`s exactly (case-insensitive),
 * so a consumer keeps only the catalogue entries whose `value` is in the set.
 *
 * Fail-open: while loading, on error, or when the list is empty/unavailable the
 * hook returns `null`, which callers treat as "no filter" (show everything).
 * This never leaves a picker empty due to a transient failure.
 */

type EnabledProviders = Set<string> | null;

type CacheEntry = { token: string; providers: EnabledProviders };

const CACHE_TTL_MS = 10 * 60 * 1000;

let cache: (CacheEntry & { timestamp: number }) | null = null;
let inflight: { token: string; promise: Promise<EnabledProviders> } | null = null;

async function fetchEnabledProviders(token: string): Promise<EnabledProviders> {
  const backendUrl = getBackendUrl();
  const response = await fetch(`${backendUrl}/providers`, {
    headers: getDefaultHeaders(token),
  });

  if (!response.ok) {
    throw new Error(`Failed to load providers: ${response.status}`);
  }

  const text = await response.text();
  const json: unknown = text ? JSON.parse(text) : null;
  const list =
    json && typeof json === "object" && Array.isArray((json as { providers?: unknown }).providers)
      ? ((json as { providers: unknown[] }).providers)
      : [];

  const names = list
    .filter((p): p is string => typeof p === "string")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  // Empty list => fail-open (no filter), consistent with the error path.
  return names.length > 0 ? new Set(names) : null;
}

function getOrFetch(token: string): Promise<EnabledProviders> {
  if (cache && cache.token === token && Date.now() - cache.timestamp < CACHE_TTL_MS) {
    return Promise.resolve(cache.providers);
  }

  if (inflight && inflight.token === token) return inflight.promise;

  const promise = fetchEnabledProviders(token)
    .then((providers) => {
      cache = { token, providers, timestamp: Date.now() };
      inflight = null;
      return providers;
    })
    .catch((err) => {
      inflight = null;
      throw err;
    });

  inflight = { token, promise };
  return promise;
}

/**
 * Returns the set of enabled provider names (lowercased), or `null` when the
 * list is unavailable/loading/empty — in which case callers show everything.
 */
export function useEnabledProviders(): EnabledProviders {
  const accessToken = useAccessToken();
  const [enabled, setEnabled] = useState<EnabledProviders>(() =>
    cache && accessToken && cache.token === accessToken ? cache.providers : null,
  );

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;

    getOrFetch(accessToken)
      .then((providers) => {
        if (!cancelled) setEnabled(providers);
      })
      .catch((err: unknown) => {
        reportError("Failed to fetch enabled providers:", err);
        if (!cancelled) setEnabled(null); // fail-open
      });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return enabled;
}

/**
 * True when a provider `value` should be shown given the enabled set.
 * `null`/undefined enabled means "no filter" (fail-open).
 */
export function isProviderEnabled(
  enabled: EnabledProviders,
  value: string,
): boolean {
  return !enabled || enabled.has(value.toLowerCase());
}
