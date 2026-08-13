/**
 * Client-side fetch interceptor that attaches the `X-Org-UUID` header to
 * every request targeting the backend.
 *
 * Several legacy pages call `fetch` directly (rather than going through
 * `src/lib/api.ts`). Rather than touching each call site, we wrap
 * `window.fetch` once on the client and add the header for requests whose
 * URL starts with `NEXT_PUBLIC_BACKEND_URL`. The backend resolves the active
 * workspace from this header.
 *
 * It is also where a request that landed in the wrong workspace is put right
 * (see `src/lib/workspaceRedirect.ts`). A page fires several requests and
 * only some of them are wired to the shared error handling, so doing this per
 * page left the rest of them showing their own error next to a page that was
 * about to switch workspaces. Every backend request passes through here, so
 * whichever one comes back first starts the switch.
 */

import { getActiveOrgUuid } from "@/lib/orgs";
import {
  readOwningOrgUuid,
  switchToOwningWorkspace,
} from "@/lib/workspaceRedirect";

let installed = false;

/**
 * On a 404 naming one of the user's other workspaces, make it active and
 * reload. Reads a copy of the body so the caller still sees an untouched
 * response.
 */
async function switchWorkspaceOn404(response: Response): Promise<void> {
  if (response.status !== 404) return;
  if (typeof response.clone !== "function") return;
  try {
    const uuid = readOwningOrgUuid(await response.clone().json());
    if (uuid) switchToOwningWorkspace(uuid);
  } catch {
    // No readable JSON body, so there is no workspace to switch to.
  }
}

export function installOrgFetchInterceptor(): void {
  if (typeof window === "undefined") return;
  if (installed) return;

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) return;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.toString();
    } else {
      url = input.url;
    }

    if (!url.startsWith(backendUrl)) {
      return originalFetch(input, init);
    }

    // The /organizations management surface (list/create/rename + members)
    // operates above any single workspace — don't scope it with X-Org-UUID.
    const path = url.slice(backendUrl.length);
    if (path.startsWith("/organizations")) {
      return originalFetch(input, init);
    }

    const activeOrgUuid = getActiveOrgUuid();
    let response: Response;
    if (!activeOrgUuid) {
      response = await originalFetch(input, init);
    } else {
      // Merge X-Org-UUID into existing headers without clobbering anything
      // else. The header may already have been set by `getDefaultHeaders` —
      // that's fine; we only set it when absent.
      const headers = new Headers(init?.headers);
      if (!headers.has("X-Org-UUID")) {
        headers.set("X-Org-UUID", activeOrgUuid);
      }
      response = await originalFetch(input, { ...init, headers });
    }

    // Not awaited: the caller gets its response straight away, and the switch
    // (when there is one) reloads the page out from under it.
    void switchWorkspaceOn404(response);
    return response;
  };

  installed = true;
}
