"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/hooks/useAccessToken";
import { fetchOrganizationsDedup } from "@/hooks/useOrganizations";
import { setActiveOrgUuid } from "@/lib/orgs";
import { NotFoundState } from "@/components/ui";

/**
 * Every page behind sign-in lives under the workspace it belongs to.
 *
 * If the address names a workspace the user is not a member of, show Not
 * Found: the same screen as a deleted item, so a link never reveals that
 * someone else's workspace exists.
 *
 * The pages underneath render straight away and only give way once we know the
 * workspace is not theirs, so the normal case gains no waiting. Their own
 * requests would fail in that case anyway; this only makes the screen honest.
 */
export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org } = useParams<{ org: string }>();
  const { accessToken, isLoading } = useAuth();
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    if (isLoading || !accessToken || !org) return;
    let cancelled = false;
    (async () => {
      const orgs = await fetchOrganizationsDedup(accessToken);
      if (cancelled || !orgs) return;
      const member = orgs.some((o) => o.uuid === org);
      setIsMember(member);
      // Remember this workspace, so a later link that names none opens here.
      if (member) setActiveOrgUuid(org);
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, isLoading, org]);

  if (isMember === false) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <NotFoundState />
      </div>
    );
  }

  return <>{children}</>;
}
