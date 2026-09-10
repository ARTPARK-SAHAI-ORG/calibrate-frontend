"use client";

import { useState } from "react";
import { useAccessToken, useOrgInviteLink } from "@/hooks";
import { CopyLinkButton } from "@/components/ui";
import { LoadingState } from "@/components/ui/LoadingState";
import { buildInviteUrl } from "@/lib/invites";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

/**
 * The invite link half of the invite dialog: one link anyone can join this
 * workspace with, made once and then simply shown.
 *
 * There is deliberately no way to turn it off or replace it here. Both of
 * those stop an address other people are already holding from working, which
 * needs a warning and a confirmation to be safe, and neither is worth carrying
 * until somebody asks for it. The backend still supports both.
 */
export function InviteLinkPanel({ orgUuid }: { orgUuid: string }) {
  const accessToken = useAccessToken();
  const {
    inviteLink,
    isLoading,
    error: loadError,
    refetch,
    createInviteLink,
  } = useOrgInviteLink(accessToken, orgUuid);

  const [isCreating, setIsCreating] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const url = inviteLink ? buildInviteUrl(inviteLink.token) : null;

  const create = async () => {
    setIsCreating(true);
    setLinkError(null);
    try {
      await createInviteLink();
    } catch (err) {
      reportError("Error creating invite link:", err);
      setLinkError(
        parseBackendErrorMessage(err, "Failed to create the invite link"),
      );
    } finally {
      setIsCreating(false);
    }
  };

  // Until the sign-in token has been read out of storage there is nothing to
  // ask with, so nothing is known yet. Treated as still loading, because the
  // create button here would offer to make a second link over the top of one
  // that may well already exist.
  const isSettling = isLoading || !accessToken;

  if (isSettling) return <LoadingState />;

  // The link could not be read, which is not the same as the workspace having
  // none. Offering to make one here would replace the link people are already
  // holding, so the only action is to try again.
  if (loadError) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-red-500">
          The invite link could not be read. Try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="h-9 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Anyone with this link can join this workspace
      </p>

      {url ? (
        <div className="flex items-center gap-2 min-w-0">
          {/* The whole address, not a shortened one: it is meant to be read
              and checked before it is sent to somebody. It can still be
              scrolled sideways if a workspace address is ever longer than the
              dialog. */}
          <div className="flex-1 min-w-0 h-10 px-3 flex items-center rounded-md border border-border bg-muted/30 overflow-x-auto">
            {/* Full strength, not the muted token: the address is the content
                here, not a hint, and it is meant to be read and checked before
                it is sent to somebody. */}
            <span className="text-xs font-mono text-foreground whitespace-nowrap">
              {url}
            </span>
          </div>
          <CopyLinkButton value={url} size="md" />
        </div>
      ) : (
        <button
          type="button"
          onClick={create}
          disabled={isCreating}
          className="w-full h-10 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreating ? "Creating the link..." : "Create an invite link"}
        </button>
      )}

      {linkError && <p className="text-sm text-red-500">{linkError}</p>}
    </div>
  );
}
