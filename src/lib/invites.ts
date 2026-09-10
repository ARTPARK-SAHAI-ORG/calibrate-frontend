/**
 * Joining a workspace from a link.
 *
 * A workspace has at most one invite link at a time, the way Discord does it.
 * Making a new one replaces the old one, so the old address stops working, and
 * turning the link off leaves everyone already in the workspace where they are.
 *
 * The link never expires on its own, so the only way it stops working is a
 * member turning it off or replacing it.
 */

import { apiPost, getBackendUrl } from "@/lib/api";
import type { Organization } from "@/lib/orgs";

/** The invite link a workspace hands out. */
export type InviteLink = {
  token: string;
  created_at: string;
};

/** What the person opening an invite link is shown before they sign in. */
export type InvitePreview = {
  organization_name: string;
};

/** The address to paste into a chat. */
export function buildInviteUrl(token: string): string {
  if (typeof window === "undefined") return `/invite/${token}`;
  return `${window.location.origin}/invite/${token}`;
}

/**
 * The name of the workspace behind an invite link. Read without signing in,
 * since the person opening the link may not have an account yet.
 *
 * Returns null ONLY when the backend says the link is unknown or turned off.
 * Every other failure is thrown, because "we could not ask" and "there is
 * nothing behind this link" have to look different to the reader: telling
 * someone their good link is dead sends them to ask for a new one, and making
 * a new one turns off the one everybody else is still holding.
 */
export async function fetchInvitePreview(
  token: string,
): Promise<InvitePreview | null> {
  const response = await fetch(
    `${getBackendUrl()}/public/invite/${encodeURIComponent(token)}`,
    { headers: { accept: "application/json" } },
  );
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as InvitePreview;
}

/**
 * Join the workspace behind an invite link. Answers with the workspace, so the
 * page can send the reader straight into it. Joining twice is not an error: the
 * same workspace comes back.
 */
export async function acceptInvite(
  token: string,
  accessToken: string,
): Promise<Organization> {
  return apiPost<Organization>(
    `/invites/${encodeURIComponent(token)}/accept`,
    accessToken,
    {},
  );
}
