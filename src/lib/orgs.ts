/**
 * Workspace / organization state.
 *
 * The frontend stores the active workspace uuid in localStorage and sends it
 * back to the backend on every request as the `X-Org-UUID` header (attached
 * automatically in `src/lib/api.ts`). The backend falls back to the user's
 * personal workspace when the header is missing or unknown, so the worst case
 * during boot is "user briefly sees personal workspace data".
 */

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
 * the workspace. The list endpoint only ever returns the masked `prefix` (the
 * first few characters, e.g. `calib_a1b2…`) — the full secret is shown exactly
 * once, in the POST response (`OrganizationApiKeyWithSecret`), and never again.
 */
export type OrganizationApiKey = {
  uuid: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
};

/** The create response, which additionally carries the plaintext key once. */
export type OrganizationApiKeyWithSecret = OrganizationApiKey & {
  key: string;
};

export function getActiveOrgUuid(): string | null {
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
