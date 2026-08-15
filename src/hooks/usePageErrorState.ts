"use client";

import { useCallback, useState } from "react";
import { signOut } from "next-auth/react";
import { getErrorStatusCode } from "@/lib/parseBackendError";
import {
  orgUuidFromErrorMessage,
  readOwningOrgUuid,
  switchToOwningWorkspace,
} from "@/lib/workspaceRedirect";

export type PageErrorCode = 401 | 403 | 404;

/**
 * `"switching"` covers the moment between the failure arriving and us knowing
 * whether it names another workspace of the user's. Pages pass it straight to
 * <NotFoundState />, which renders the normal spinner for it, so a link that
 * is about to switch workspaces never flashes a dead end first.
 */
export type PageErrorState = PageErrorCode | "switching";

/**
 * Centralizes the "resource page failed to load" wiring shared by every
 * authenticated detail page: a 401 signs the user out, while 403 / 404 are
 * surfaced as a full-page <NotFoundState errorCode={errorCode} /> instead of
 * the generic error/Retry state.
 *
 * Either of those is also where a shared link lands when the thing sits in one
 * of the user's other workspaces. The backend names that workspace in the body
 * (see `src/lib/workspaceRedirect.ts`), and we make it active and reload rather
 * than showing the dead end. The backend is moving that answer from 404 to 403,
 * so both are read the same way and neither needs to land first.
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
  const [errorCode, setErrorCode] = useState<PageErrorState | null>(null);

  const reset = useCallback(() => setErrorCode(null), []);

  const captureResponse = useCallback((response: Response): boolean => {
    if (response.status === 401) {
      void signOut({ callbackUrl: "/login" });
      return true;
    }
    const status = response.status;
    if (status !== 403 && status !== 404) return false;
    // The body is read off a copy so the caller's own error handling (and
    // any later `res.json()`) still sees an unconsumed response.
    if (typeof response.clone === "function") {
      setErrorCode("switching");
      void response
        .clone()
        .json()
        .then((body) => {
          if (!switchToOwningWorkspace(readOwningOrgUuid(body))) {
            setErrorCode(status);
          }
        })
        .catch(() => setErrorCode(status));
      return true;
    }
    setErrorCode(status);
    return true;
  }, []);

  const captureError = useCallback((err: unknown): boolean => {
    const status = getErrorStatusCode(err);
    if (status !== 403 && status !== 404) return false;
    const switching = switchToOwningWorkspace(orgUuidFromErrorMessage(err));
    setErrorCode(switching ? "switching" : status);
    return true;
  }, []);

  return { errorCode, reset, captureResponse, captureError };
}
