/**
 * Client-side fetch interceptor that attaches the `X-Org-UUID` header to
 * every request targeting the backend.
 *
 * Several legacy pages call `fetch` directly (rather than going through
 * `src/lib/api.ts`). Rather than touching each call site, we wrap
 * `window.fetch` once on the client and add the header for requests whose
 * URL starts with `NEXT_PUBLIC_BACKEND_URL`. The backend resolves the active
 * workspace from this header.
 */

import { getActiveOrgUuid } from "@/lib/orgs";

let installed = false;

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
    if (!activeOrgUuid) {
      return originalFetch(input, init);
    }

    // Merge X-Org-UUID into existing headers without clobbering anything else.
    // The header may already have been set by `getDefaultHeaders` — that's
    // fine; we only set it when absent.
    const headers = new Headers(init?.headers);
    if (!headers.has("X-Org-UUID")) {
      headers.set("X-Org-UUID", activeOrgUuid);
    }

    return originalFetch(input, { ...init, headers });
  };

  installed = true;
}
