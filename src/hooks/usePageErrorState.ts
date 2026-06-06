"use client";

import { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { getErrorStatusCode } from "@/lib/parseBackendError";

export type PageErrorCode = 401 | 403 | 404;

/**
 * Centralizes the "resource page failed to load" wiring shared by every
 * authenticated detail page: a 401 signs the user out, while 403 / 404 are
 * surfaced as a full-page <NotFoundState errorCode={errorCode} /> instead of
 * the generic error/Retry state.
 *
 * Two capture helpers cover the two ways pages talk to the backend:
 *   - `captureResponse(res)` for raw `fetch` calls (status off `res.status`);
 *   - `captureError(err)` for `apiClient` calls (status parsed from the thrown
 *     "Request failed: <status> - ..." message).
 *
 * Both return `true` when they've handled the failure so the caller can bail
 * early, and `false` otherwise so it falls through to its own logic (e.g. an
 * `!res.ok` throw or a generic error string).
 *
 * Usage:
 *   const { errorCode, reset, captureResponse, captureError } = usePageErrorState();
 *   // raw fetch:   if (captureResponse(res)) return;  then  if (!res.ok) throw ...
 *   // apiClient:   catch (err) { if (captureError(err)) return; ...generic... }
 *   // render:      if (errorCode) return <NotFoundState errorCode={errorCode} />;
 */
export function usePageErrorState() {
  const [errorCode, setErrorCode] = useState<PageErrorCode | null>(null);

  const reset = useCallback(() => setErrorCode(null), []);

  const captureResponse = useCallback((response: Response): boolean => {
    if (response.status === 401) {
      void signOut({ callbackUrl: "/login" });
      return true;
    }
    if (response.status === 403 || response.status === 404) {
      setErrorCode(response.status);
      return true;
    }
    return false;
  }, []);

  const captureError = useCallback((err: unknown): boolean => {
    const status = getErrorStatusCode(err);
    if (status === 403 || status === 404) {
      setErrorCode(status);
      return true;
    }
    return false;
  }, []);

  return { errorCode, reset, captureResponse, captureError };
}
