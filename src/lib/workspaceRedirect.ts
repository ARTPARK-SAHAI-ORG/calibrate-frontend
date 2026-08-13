import { getActiveOrgUuid } from "@/lib/orgs";
import { splitWorkspace, withWorkspace } from "@/lib/routes";

/**
 * Opening a link to something that lives in one of the user's *other*
 * workspaces used to dead-end on the "Not Found" screen: the request carried
 * the workspace the reader happened to be in, the backend looked there only,
 * and the frontend could not tell "wrong workspace" from "deleted".
 *
 * Links now name their workspace, so this only catches links made before that
 * was true. The backend answers a 404 for something the caller can reach with
 * the workspace that owns it:
 *
 *   404 { "detail": "Agent not found", "organization_uuid": "<uuid>" }
 *
 * The field is left out when the caller is not a member, so a plain 404 stays a
 * plain 404 and we never reveal that someone else's item exists.
 *
 * Wired into `usePageErrorState`, which every page routes its load failure
 * through.
 */

/** Reads the owning workspace uuid out of a parsed 404 body. */
export function readOwningOrgUuid(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const uuid = (body as { organization_uuid?: unknown }).organization_uuid;
  return typeof uuid === "string" && uuid.trim().length > 0 ? uuid : null;
}

/**
 * Same, for a failure thrown by `apiClient`, whose message follows
 * `"Request failed: <status> - <body>"`.
 */
export function orgUuidFromErrorMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/Request failed:\s*\d+\s*-\s*([\s\S]+)$/);
  if (!match) return null;
  try {
    return readOwningOrgUuid(JSON.parse(match[1]));
  } catch {
    return null;
  }
}

/**
 * Opens the same page under the workspace that owns it. Returns false, leaving
 * the caller to show the normal "Not Found", when that would change nothing.
 *
 * Going round in circles is not possible: the workspace is part of the address,
 * so a second 404 from the same page reports the workspace already in it.
 */
export function switchToOwningWorkspace(uuid: string | null): boolean {
  if (!uuid || uuid === getActiveOrgUuid()) return false;

  const { path } = splitWorkspace(window.location.pathname);
  window.location.replace(
    withWorkspace(path, uuid) + window.location.search + window.location.hash,
  );
  return true;
}
