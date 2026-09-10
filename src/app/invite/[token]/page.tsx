"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Button, LoadingState } from "@/components/ui";
import { clearOrgsCache, useAuth } from "@/hooks";
import { acceptInvite, fetchInvitePreview } from "@/lib/invites";
import { notifyOrganizationsChanged, setActiveOrgUuid } from "@/lib/orgs";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";
import { CALLBACK_PARAM } from "@/lib/postLoginRedirect";
import { HOME_PATH, withWorkspace } from "@/lib/routes";

const PAGE_TITLE = "Join a workspace | Calibrate";

export default function InvitePage() {
  const params = useParams();
  const token = params.token as string;

  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, accessToken } = useAuth();

  // Three answers, not two. "We could not ask" has to look different from
  // "there is nothing behind this link": telling someone their good link is
  // dead sends them to ask for a replacement, and making a new one turns off
  // the link everybody else is still holding.
  const [workspaceName, setWorkspaceName] = useState<string | null>(null);
  const [couldNotCheck, setCouldNotCheck] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(true);
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState("");

  useEffect(() => {
    document.title = PAGE_TITLE;
  }, []);

  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchInvitePreview(token)
      .then((preview) => {
        if (cancelled) return;
        setCouldNotCheck(false);
        setWorkspaceName(preview?.organization_name ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        reportError("Error reading the invite link:", err);
        setWorkspaceName(null);
        setCouldNotCheck(true);
      })
      .finally(() => {
        if (!cancelled) setIsPreviewLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadCount]);

  const handleJoin = useCallback(async () => {
    if (!accessToken) return;
    setJoinError("");
    setIsJoining(true);
    try {
      const org = await acceptInvite(token, accessToken);
      setActiveOrgUuid(org.uuid);
      clearOrgsCache();
      notifyOrganizationsChanged();
      router.replace(withWorkspace(HOME_PATH, org.uuid));
    } catch (err) {
      setJoinError(
        parseBackendErrorMessage(err, "Could not join the workspace"),
      );
      setIsJoining(false);
    }
  }, [accessToken, router, token]);

  const backHere = `/invite/${token}`;
  const callback = `${CALLBACK_PARAM}=${encodeURIComponent(backHere)}`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md border border-border rounded-2xl bg-background p-8 text-center">
          {isPreviewLoading || isAuthLoading ? (
            <LoadingState />
          ) : couldNotCheck ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">
                This invite link could not be checked
              </h1>
              <p className="text-base text-muted-foreground mt-2">
                The link may still be good. Try again in a moment.
              </p>
              <div className="mt-6 flex justify-center">
                <Button
                  onClick={() => {
                    setIsPreviewLoading(true);
                    setReloadCount((n) => n + 1);
                  }}
                >
                  Try again
                </Button>
              </div>
            </>
          ) : workspaceName === null ? (
            <>
              <h1 className="text-2xl font-semibold text-foreground">
                This invite link no longer works
              </h1>
              <p className="text-base text-muted-foreground mt-2">
                Ask whoever sent it for a new one.
              </p>
              <Link
                href="/"
                className="inline-block mt-6 text-base font-medium text-foreground underline cursor-pointer"
              >
                Go to the home page
              </Link>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold text-foreground">
                You have been invited to join {workspaceName}
              </h1>
              {isAuthenticated ? (
                <>
                  <div className="mt-6 flex justify-center">
                    <Button
                      onClick={handleJoin}
                      isLoading={isJoining}
                      loadingText={`Joining ${workspaceName}`}
                    >
                      Join {workspaceName}
                    </Button>
                  </div>
                  {joinError && (
                    <p className="mt-3 text-sm text-red-500">{joinError}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-base text-muted-foreground mt-2">
                    Sign in or create an account to join.
                  </p>
                  <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                    <Link
                      href={`/login?${callback}`}
                      className="h-10 px-4 rounded-md text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity flex items-center justify-center cursor-pointer"
                    >
                      Sign in
                    </Link>
                    <Link
                      href={`/signup?${callback}`}
                      className="h-10 px-4 rounded-md text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors flex items-center justify-center cursor-pointer"
                    >
                      Create an account
                    </Link>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
