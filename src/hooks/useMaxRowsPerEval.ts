"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { useAccessToken } from "./useAccessToken";
import { LIMITS } from "@/constants/limits";

type MaxRowsResponse = {
  max_rows_per_eval: number;
};

// Module-level cache shared across all hook instances.
// Avoids duplicate API calls when multiple components mount the hook.
let cachedPromise: Promise<number> | null = null;
let cachedToken: string | null = null;

/**
 * The workspace's max rows per eval, outside React. Every bulk run reads the
 * limit through this (the hook below is the same call, for rendering). Falls
 * back to LIMITS.DEFAULT_MAX_ROWS_PER_EVAL when there is no token or the
 * request fails, so a run is never blocked by an unreachable limit.
 */
export function getMaxRowsPerEval(
  accessToken: string | null | undefined,
): Promise<number> {
  if (!accessToken) return Promise.resolve(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL);
  return fetchMaxRows(accessToken);
}

function fetchMaxRows(accessToken: string): Promise<number> {
  if (cachedToken !== accessToken) {
    cachedPromise = null;
    cachedToken = accessToken;
  }

  if (!cachedPromise) {
    cachedPromise = apiGet<MaxRowsResponse>(
      "/org-limits/me/max-rows-per-eval",
      accessToken,
    )
      .then((data) =>
        data.max_rows_per_eval != null
          ? data.max_rows_per_eval
          : LIMITS.DEFAULT_MAX_ROWS_PER_EVAL,
      )
      .catch(() => {
        cachedPromise = null;
        return LIMITS.DEFAULT_MAX_ROWS_PER_EVAL;
      });
  }

  return cachedPromise;
}

/**
 * Fetches the org-specific max rows per eval from the backend.
 * Starts with LIMITS.DEFAULT_MAX_ROWS_PER_EVAL and updates when the API responds.
 * All hook instances share a single cached request per access token.
 */
export function useMaxRowsPerEval(): number {
  const accessToken = useAccessToken();
  const [maxRows, setMaxRows] = useState<number>(LIMITS.DEFAULT_MAX_ROWS_PER_EVAL);

  useEffect(() => {
    if (!accessToken) return;

    let cancelled = false;

    fetchMaxRows(accessToken).then((value) => {
      if (!cancelled) setMaxRows(value);
    });

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return maxRows;
}
