import { signOut } from "next-auth/react";
import { getActiveOrgUuid } from "@/lib/orgs";
import { clearOrgsCache } from "@/hooks/useOrganizations";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Get the backend URL from environment variables
 */
export function getBackendUrl(): string {
  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (!backendUrl) {
    throw new Error("BACKEND_URL environment variable is not set");
  }
  return backendUrl;
}

/**
 * Paginated envelope returned by the list endpoints (`/agents`, `/tests`,
 * `/evaluators`, `/annotation-tasks`, `/agent-tests/.../tests`,
 * `/agent-tests/.../runs`). The array now lives under `items`; `total` is the
 * count of the full filtered set before paging.
 */
export type Paginated<T> = {
  items: T[];
  total: number;
  limit: number | null;
  offset: number;
};

/**
 * Extract the array from a list response, tolerating three shapes:
 *  - the new `{ items, total, limit, offset }` envelope,
 *  - a legacy `{ runs: [...] }` payload (the two run lists before migration),
 *  - a legacy `{ jobs: [...] }` payload (the STT/TTS jobs list before migration),
 *  - a bare array (endpoints that never changed, or pre-deploy responses).
 * Anything else yields an empty array.
 */
export function unwrapList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === "object") {
    const obj = data as { items?: unknown; runs?: unknown; jobs?: unknown };
    if (Array.isArray(obj.items)) return obj.items as T[];
    if (Array.isArray(obj.runs)) return obj.runs as T[];
    if (Array.isArray(obj.jobs)) return obj.jobs as T[];
  }
  return [];
}

/**
 * Default headers for API requests
 */
export function getDefaultHeaders(accessToken?: string | null): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
  };

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Active workspace is resolved by the backend from this header. When absent
  // the backend falls back to the user's personal workspace, so this is safe
  // to omit (e.g. during initial boot before /organizations resolves).
  const activeOrgUuid = getActiveOrgUuid();
  if (activeOrgUuid) {
    headers["X-Org-UUID"] = activeOrgUuid;
  }

  return headers;
}

/**
 * API client for making authenticated requests to the backend
 * Handles 401 responses by signing out the user
 * 
 * @param endpoint - API endpoint (without base URL)
 * @param accessToken - Backend access token from session
 * @param options - Request options (method, body, headers)
 * @returns Promise<T> - Parsed JSON response
 * @throws Error on non-2xx responses or network errors
 */
export async function apiClient<T>(
  endpoint: string,
  accessToken: string,
  options: RequestOptions = {}
): Promise<T> {
  const backendUrl = getBackendUrl();
  const { method = "GET", body, headers: customHeaders } = options;

  const headers: Record<string, string> = {
    ...getDefaultHeaders(accessToken),
    ...customHeaders,
  };

  // /organizations is the workspace-management surface (list, create,
  // rename, members) and operates above any single workspace. Sending the
  // active workspace header would either be ignored or — worse — cause a
  // 403/404 after the user leaves the active workspace.
  if (endpoint.startsWith("/organizations")) {
    delete headers["X-Org-UUID"];
  }

  // Add Content-Type for requests with body
  if (body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${backendUrl}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Handle 401 Unauthorized - sign out user
  if (response.status === 401) {
    // Clear localStorage
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");
    localStorage.removeItem("activeOrgUuid");
    // Clear in-memory caches that are scoped to the signed-in user.
    clearOrgsCache();
    // Clear cookie
    document.cookie = "access_token=; path=/; max-age=0; SameSite=Lax";
    // Sign out via NextAuth
    await signOut({ callbackUrl: "/login" });
    throw new Error("Unauthorized - session expired");
  }

  // Handle non-2xx responses
  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`Request failed: ${response.status} - ${errorText}`);
  }

  // Handle empty responses (204 No Content, zero-length body, etc.)
  if (response.status === 204) return {} as T;

  const contentType = response.headers.get("content-type");
  if (!contentType || !contentType.includes("application/json")) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

/**
 * Convenience wrapper for GET requests
 */
export async function apiGet<T>(endpoint: string, accessToken: string): Promise<T> {
  return apiClient<T>(endpoint, accessToken, { method: "GET" });
}

/**
 * Convenience wrapper for POST requests
 */
export async function apiPost<T>(
  endpoint: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  return apiClient<T>(endpoint, accessToken, { method: "POST", body });
}

/**
 * Convenience wrapper for PUT requests
 */
export async function apiPut<T>(
  endpoint: string,
  accessToken: string,
  body: unknown
): Promise<T> {
  return apiClient<T>(endpoint, accessToken, { method: "PUT", body });
}

/**
 * Convenience wrapper for DELETE requests
 */
export async function apiDelete<T>(endpoint: string, accessToken: string): Promise<T> {
  return apiClient<T>(endpoint, accessToken, { method: "DELETE" });
}
