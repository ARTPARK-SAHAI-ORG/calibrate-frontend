/**
 * Where to send someone after they sign in.
 *
 * When a logged-out user opens a shared link, the middleware puts the page they
 * asked for on the login URL as `callbackUrl`. The login and signup pages read it
 * back so the link is not lost.
 */

import { OPENING_PATH } from "@/lib/opening";

export const DEFAULT_POST_LOGIN_PATH = "/agents";

export const CALLBACK_PARAM = "callbackUrl";

// Any host, only used to work out whether the address stays on this site.
const PROBE_ORIGIN = "https://calibrate.invalid";

/**
 * Accept only a path on this site, so a crafted link cannot send someone
 * somewhere else after they sign in.
 *
 * The address is read by the same parser browsers use, and rebuilt from the
 * parts it produced. Checking the text by hand is not enough: browsers drop
 * tabs and line breaks first, so "/<tab>/other-site.example" turns into an
 * address on another site even though it starts with a single slash.
 */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_POST_LOGIN_PATH;

  let parsed: URL;
  try {
    parsed = new URL(raw, PROBE_ORIGIN);
  } catch {
    return DEFAULT_POST_LOGIN_PATH;
  }
  if (parsed.origin !== PROBE_ORIGIN) return DEFAULT_POST_LOGIN_PATH;
  // Sending someone back to a page that only forwards them somewhere else is
  // never what they asked for, and the opening page pointed at itself lands on
  // a page that does not exist.
  if (
    parsed.pathname === "/login" ||
    parsed.pathname === "/signup" ||
    parsed.pathname === OPENING_PATH
  ) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return parsed.pathname + parsed.search + parsed.hash;
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

/**
 * Where to send someone whose session has just run out.
 *
 * The page they were on is carried along, so signing in again brings them back
 * to it. Without this a session that expires mid-action drops the reader on
 * /agents, and a page they reached by a link somebody sent them (an invite, a
 * shared result) is simply gone: they have to find the message again.
 *
 * Everything that signs someone out because of a 401 must use this rather than
 * writing "/login" by hand.
 */
export function loginPathAfterSignOut(): string {
  const here =
    typeof window === "undefined"
      ? null
      : window.location.pathname + window.location.search;
  const wanted = safeCallbackUrl(here);
  return `/login?${CALLBACK_PARAM}=${encodeURIComponent(wanted)}`;
}
