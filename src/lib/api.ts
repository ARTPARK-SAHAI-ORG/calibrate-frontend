import { signOut } from "next-auth/react";

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
 * Default headers for API requests
 */
export function getDefaultHeaders(accessToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "ngrok-skip-browser-warning": "true",
  };
  
  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
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
