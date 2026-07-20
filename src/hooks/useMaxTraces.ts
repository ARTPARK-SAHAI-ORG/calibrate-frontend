"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { useAccessToken } from "./useAccessToken";
import { LIMITS } from "@/constants/limits";

type MaxTracesResponse = {
  max_traces: number;
};

// Module-level cache shared across all hook instances, keyed by access token
// — same pattern as useMaxRowsPerEval.
let cachedPromise: Promise<number> | null = null;
let cachedToken: string | null = null;

function fetchMaxTraces(accessToken: string): Promise<number> {
  if (cachedToken !== accessToken) {
    cachedPromise = null;
    cachedToken = accessToken;
  }

  if (!cachedPromise) {
    cachedPromise = apiGet<MaxTracesResponse>(
      "/org-limits/me/max-traces",
      accessToken,
    )
      .then((data) =>
        data.max_traces != null ? data.max_traces : LIMITS.DEFAULT_MAX_TRACES,
      )
      .catch(() => {
        cachedPromise = null;
        return LIMITS.DEFAULT_MAX_TRACES;
      });
  }

  return cachedPromise;
}

/**
 * Fetches the workspace's max stored traces from the backend. Starts with
 * LIMITS.DEFAULT_MAX_TRACES and updates when the API responds. All hook
 * instances share a single cached request per access token.
 */
export function useMaxTraces(): number {
  const accessToken = useAccessToken();
  const [maxTraces, setMaxTraces] = useState<number>(LIMITS.DEFAULT_MAX_TRACES);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    fetchMaxTraces(accessToken).then((value) => {
      if (!cancelled) setMaxTraces(value);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return maxTraces;
}
