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
import { withWorkspace } from "@/lib/routes";
import { CALLBACK_PARAM, safeCallbackUrl } from "@/lib/postLoginRedirect";
import { ErrorState, LoadingState } from "@/components/ui/LoadingState";

/**
 * The page someone asked for, taken from the address.
 *
 * This page is shown *in place of* that page, with the address left as the
 * person typed it, so the address itself is what they wanted. Only a page on
 * this site is accepted, so a crafted link cannot use this page to send
 * someone somewhere else.
 */
function wantedPage(): string {
  return safeCallbackUrl(
    window.location.pathname + window.location.search + window.location.hash,
  );
}

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
    if (isAuthLoading) return;

    // The middleware only shows this page to someone signed in, so a missing
    // token means the sign-in lapsed in between. Send them to sign in, keeping
    // the page they asked for, rather than leaving them on a spinner forever.
    if (!accessToken) {
      const wanted = encodeURIComponent(wantedPage());
      router.replace(`/login?${CALLBACK_PARAM}=${wanted}`);
      return;
    }

    let cancelled = false;
    const target = wantedPage();

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
