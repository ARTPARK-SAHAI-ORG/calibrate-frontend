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
  has_logged_in: boolean;
  created_at: string;
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
