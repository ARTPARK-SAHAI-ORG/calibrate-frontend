import { getBackendUrl } from "@/lib/api";

export type PublicFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; text: string };

/**
 * A request to a public backend route, for pages opened from a link with no
 * sign-in. It never signs anyone out, unlike `apiClient`, and hands back the
 * status and body of a failure for the page to read. `accessToken`, when the
 * reader happens to be signed in, lets the backend show them more.
 */
export async function publicFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown; accessToken?: string | null },
): Promise<PublicFetchResult<T>> {
  const res = await fetch(`${getBackendUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.accessToken
        ? { Authorization: `Bearer ${init.accessToken}` }
        : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, text };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}
