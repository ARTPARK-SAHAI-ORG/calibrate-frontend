import {
  ACTIVE_ORG_CHANGED_EVENT,
  getActiveOrgUuid,
  setActiveOrgUuid,
} from "@/lib/orgs";

/**
 * Opening a shared link to a resource that lives in one of the user's *other*
 * workspaces used to dead-end on the "Not Found" screen: the request carries
 * the active workspace in `X-Org-UUID`, the backend looks in that workspace
 * only, and the frontend cannot tell "wrong workspace" from "deleted".
 *
 * The backend now answers that. On a 404 for a resource that exists in a
 * workspace the caller is a member of, the body carries the owning workspace:
 *
 *   404 { "detail": "Agent not found", "organization_uuid": "<uuid>" }
 *
 * The field is omitted when the caller is not a member, so a plain 404 stays a
 * plain 404 and we never reveal that someone else's resource exists.
 *
 * Wired into `usePageErrorState`, which every resource page routes its load
 * failure through.
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
 * Records, per browser tab, the page we have already switched for and the
 * workspace we landed in, as `<path>@<uuid>`.
 */
const SWITCHED_KEY = "calibrate:workspace-switched-path";

/**
 * The active workspace as this tab last saw it change: read once when the page
 * loads, then kept current through the change event, which only fires in the
 * tab that made the change. So when the stored workspace stops matching this,
 * some *other* tab changed it.
 */
let workspaceKnownToThisTab: string | null = null;

if (typeof window !== "undefined") {
  workspaceKnownToThisTab = getActiveOrgUuid();
  window.addEventListener(ACTIVE_ORG_CHANGED_EVENT, () => {
    workspaceKnownToThisTab = getActiveOrgUuid();
  });
}

/**
 * Makes the owning workspace active and reloads, so every fetch on the page
 * re-runs under it (same approach as the sidebar workspace switcher). Returns
 * false — leaving the caller to render the normal "Not Found" — whenever
 * reloading would not help.
 */
export function switchToOwningWorkspace(uuid: string | null): boolean {
  // Already active: a reload would change nothing and repeat this 404.
  const active = getActiveOrgUuid();
  if (!uuid || uuid === active) return false;

  // Another tab changed the workspace after this page loaded. That is a newer
  // decision than anything this page can infer from a 404, so leave it alone:
  // a background poll here would otherwise quietly undo the switch the user
  // just made over there, and send that tab's requests to the wrong workspace.
  if (workspaceKnownToThisTab !== null && active !== workspaceKnownToThisTab) {
    return false;
  }

  // We already switched this page into the workspace we are sitting in, and
  // it 404'd again. Switching a second time would reload straight back into
  // the same answer, forever. Keyed on the workspace as well as the page, so
  // opening the same link again later, from somewhere else, still works.
  const path = window.location.pathname;
  let switched: string | null = null;
  try {
    switched = window.sessionStorage.getItem(SWITCHED_KEY);
  } catch {}
  if (switched === `${path}@${active}`) return false;

  // setActiveOrgUuid swallows a storage failure. Reloading without the write
  // would hit the same 404 and reload again, with no way out.
  setActiveOrgUuid(uuid);
  if (getActiveOrgUuid() !== uuid) return false;

  try {
    window.sessionStorage.setItem(SWITCHED_KEY, `${path}@${uuid}`);
  } catch {}
  window.location.reload();
  return true;
}
