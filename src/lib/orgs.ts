/**
 * Workspace / organization state.
 *
 * The workspace a page belongs to is the first part of its address
 * (`/<workspace-uuid>/agents`, see `src/lib/routes.ts`), and that is what every
 * request sends back to the backend as the `X-Org-UUID` header (attached
 * automatically in `src/lib/api.ts`).
 *
 * The stored copy in localStorage is only a memory of the workspace last
 * opened, used to pick one when a link does not name it (an older link, or the
 * page someone lands on after signing in). It is never what a request goes by,
 * so a page can no longer load against a different workspace than the one in
 * the address.
 */

import { orgFromPath } from "@/lib/routes";

export const ACTIVE_ORG_UUID_KEY = "activeOrgUuid";
export const ACTIVE_ORG_CHANGED_EVENT = "calibrate:active-org-changed";
/**
 * Fired when the user's set of workspaces (or one workspace's fields, e.g.
 * its name) changes locally. Any mounted `useOrganizations` instance
 * refetches when it sees this so the sidebar switcher stays in sync with
 * actions taken on the settings page, and vice versa.
 */
export const ORGANIZATIONS_CHANGED_EVENT = "calibrate:organizations-changed";

/**
 * Notify every mounted useOrganizations hook that the workspace list has
 * changed. Pass the originating hook instance's source token to let the
 * dispatcher's own listener skip the refetch (the mutator already applied
 * the change locally and updated the module cache).
 */
export function notifyOrganizationsChanged(source?: symbol): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(ORGANIZATIONS_CHANGED_EVENT, { detail: { source } }),
  );
}

export type OrganizationRole = "owner" | "admin";

export type Organization = {
  uuid: string;
  name: string;
  is_personal: boolean;
  created_by_user_id: string;
  member_role: OrganizationRole;
  created_at: string;
  updated_at: string;
};

export type OrganizationMember = {
  user_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: OrganizationRole;
  created_at: string;
};

/**
 * A workspace-scoped API key, used by CI / GitHub Actions to authenticate as
 * the active workspace (scoped via the `X-Org-UUID` header, not the URL). The
 * list endpoint never returns the secret — only `masked_key` (e.g.
 * `sk_••••a2b3`) and its `last_four`. The full plaintext `key` is returned
 * exactly once, in the POST response (`OrganizationApiKeyWithSecret`).
 */
export type OrganizationApiKey = {
  uuid: string;
  name: string;
  last_four: string;
  masked_key: string;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The create response, which additionally carries the plaintext key once. */
export type OrganizationApiKeyWithSecret = OrganizationApiKey & {
  key: string;
};

/**
 * The workspace this page belongs to: the one named by the address, falling
 * back to the last one opened while a page that does not name a workspace
 * (login, a shared result page) is on screen.
 *
 * Reading the address rather than storage is what keeps a request and the page
 * that made it in the same workspace, including in a second tab opened on a
 * different workspace.
 */
export function getActiveOrgUuid(): string | null {
  if (typeof window === "undefined") return null;
  const fromUrl = orgFromPath(window.location.pathname);
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_UUID_KEY);
  } catch {
    return null;
  }
}

/** The workspace last opened, ignoring the address. */
export function getRememberedOrgUuid(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(ACTIVE_ORG_UUID_KEY);
  } catch {
    return null;
  }
}

export function setActiveOrgUuid(uuid: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ACTIVE_ORG_UUID_KEY, uuid);
    window.dispatchEvent(
      new CustomEvent(ACTIVE_ORG_CHANGED_EVENT, { detail: { uuid } }),
    );
  } catch {
    // ignore
  }
}

export function clearActiveOrgUuid(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(ACTIVE_ORG_UUID_KEY);
    window.dispatchEvent(
      new CustomEvent(ACTIVE_ORG_CHANGED_EVENT, { detail: { uuid: null } }),
    );
  } catch {
    // ignore
  }
}

/**
 * Pick the org whose uuid should become active when no choice has been made
 * yet. Prefer the personal workspace; fall back to the first entry.
 */
export function pickDefaultOrg(orgs: Organization[]): Organization | null {
  if (orgs.length === 0) return null;
  return orgs.find((o) => o.is_personal) ?? orgs[0];
}
