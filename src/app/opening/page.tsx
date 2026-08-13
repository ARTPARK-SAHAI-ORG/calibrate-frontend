"use client";

import { useEffect, useState } from "react";
import { useRouter as useNextRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAccessToken";
import { fetchOrganizationsDedup } from "@/hooks/useOrganizations";
import {
  getRememberedOrgUuid,
  pickDefaultOrg,
  setActiveOrgUuid,
} from "@/lib/orgs";
import { OPENING_TARGET_PARAM } from "@/lib/opening";
import { HOME_PATH, withWorkspace } from "@/lib/routes";
import { safeCallbackUrl } from "@/lib/postLoginRedirect";
import { ErrorState, LoadingState } from "@/components/ui/LoadingState";

/**
 * Works out which workspace the address belongs to, then puts it in the
 * address. See `src/lib/opening.ts` for when this page is shown.
 *
 * The workspace last opened wins, as long as the user is still a member of it.
 * Otherwise their personal workspace does.
 */
export default function OpeningPage() {
  const router = useNextRouter();
  const { accessToken, isLoading: isAuthLoading } = useAuth();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (isAuthLoading || !accessToken) return;
    let cancelled = false;

    // Read the wanted page from the address rather than useSearchParams, which
    // would need a Suspense boundary around this page to build.
    // Only a page on this site is accepted, so a crafted link cannot use this
    // page to send someone somewhere else.
    const target = safeCallbackUrl(
      new URLSearchParams(window.location.search).get(OPENING_TARGET_PARAM) ??
        HOME_PATH,
    );

    (async () => {
      const orgs = await fetchOrganizationsDedup(accessToken);
      if (cancelled) return;
      if (!orgs || orgs.length === 0) {
        setFailed(true);
        return;
      }
      const remembered = getRememberedOrgUuid();
      const org =
        orgs.find((o) => o.uuid === remembered) ?? pickDefaultOrg(orgs);
      if (!org) {
        setFailed(true);
        return;
      }
      setActiveOrgUuid(org.uuid);
      router.replace(withWorkspace(target, org.uuid));
    })();

    return () => {
      cancelled = true;
    };
  }, [accessToken, isAuthLoading, router]);

  if (failed) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <ErrorState
          message="We could not open your workspace."
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <LoadingState />
    </div>
  );
}
