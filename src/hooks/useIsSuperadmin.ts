"use client";

import { useState, useEffect } from "react";
import { apiGet } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useAccessToken } from "./useAccessToken";

// One request per signed-in user, shared by every caller.
let cachedPromise: Promise<boolean> | null = null;
let cachedToken: string | null = null;

function getIsSuperadmin(accessToken: string): Promise<boolean> {
  if (cachedToken !== accessToken || !cachedPromise) {
    cachedToken = accessToken;
    cachedPromise = apiGet<{ is_superadmin?: boolean }>(
      "/admin/access",
      accessToken,
    )
      .then((data) => data.is_superadmin === true)
      .catch((error) => {
        reportError("Failed to check analytics access", error);
        cachedPromise = null;
        return false;
      });
  }
  return cachedPromise;
}

/** True when the signed-in user may open the Analytics page. False while it
 *  loads and when the check fails. */
export function useIsSuperadmin(): boolean {
  const accessToken = useAccessToken();
  // Remembers which token the answer was for, so a new token reads false
  // until its own answer arrives.
  const [answer, setAnswer] = useState<{ token: string; value: boolean }>();

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    getIsSuperadmin(accessToken).then((value) => {
      if (!cancelled) setAnswer({ token: accessToken, value });
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  return !!accessToken && answer?.token === accessToken && answer.value;
}
