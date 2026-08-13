/**
 * Where to send someone after they sign in.
 *
 * When a logged-out user opens a shared link, the middleware puts the page they
 * asked for on the login URL as `callbackUrl`. The login and signup pages read it
 * back so the link is not lost.
 */

export const DEFAULT_POST_LOGIN_PATH = "/agents";

export const CALLBACK_PARAM = "callbackUrl";

/**
 * Accept only a path on this site, so a crafted link cannot send someone
 * somewhere else after they sign in.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_POST_LOGIN_PATH;
  // "//host" and "/\host" are read by browsers as another site.
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  const path = raw.split(/[?#]/)[0];
  if (path === "/login" || path === "/signup") return DEFAULT_POST_LOGIN_PATH;
  return raw;
}

/** Read the wanted page out of a query string, e.g. `window.location.search`. */
export function postLoginPath(search: string): string {
  return safeCallbackUrl(new URLSearchParams(search).get(CALLBACK_PARAM));
}

/** Carry the wanted page across the link between the login and signup pages. */
export function withCallback(path: string, search: string): string {
  const wanted = new URLSearchParams(search).get(CALLBACK_PARAM);
  return wanted
    ? `${path}?${CALLBACK_PARAM}=${encodeURIComponent(wanted)}`
    : path;
}
